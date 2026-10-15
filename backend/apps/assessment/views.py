import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.rag_service import semantic_search, semantic_search_with_summary
from apps.integrations.trial import trial_generation_gate

from .serializers import GenerateAssessmentSerializer

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_assessment(request):
    """
    Generate a complete assessment (items + rubric) using RAG + CoT + LLM.

    Endpoint: POST /api/assessment/generate-assessment/

    Body (JSON):
    {
        "course_name": "Database Systems",
        "assessment_type": "midterm exam",       // required
        "num_items": 30,                         // optional, default 20
        "clos": [                                // optional list of CLO strings
            "CLO 1: Design normalised relational schemas",
            "CLO 2: Write complex SQL queries"
        ],
        "provider": "groq",                      // optional
        "top_k": 5,                              // optional
        "search_query": "...",                   // optional override
        "extra_instructions": "..."              // optional
    }

    Pipeline:
        1. Semantic search over the knowledge base with course + assessment topic.
        2. CoT prompt builder assembles system + user prompts with retrieved context.
        3. LLMService sends the prompt to the configured provider.
        4. Generated assessment (TOS + items + rubric) is returned in the response.
    """
    trial_response = trial_generation_gate(request.user, syllabus_generation=False)
    if trial_response:
        return trial_response

    serializer = GenerateAssessmentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    course_name = data["course_name"]
    assessment_type = data["assessment_type"]
    num_items = data.get("num_items", 20)
    clos = data.get("clos", [])
    top_k = data.get("top_k", 5)
    provider = data.get("provider") or None
    extra_instructions = data.get("extra_instructions", "")
    search_query = data.get("search_query") or (
        f"{course_name} {assessment_type} questions learning outcomes assessment items"
    )

    try:
        # Step 1 — Semantic search with progressive summary
        rag_result = semantic_search_with_summary(
            search_query, institution_id=request.user.institution_id, top_k=top_k,
        )
        chunks = rag_result["chunks"]
        logger.info(
            "Assessment generation for %r (%s, %d items): retrieved %d RAG chunk(s) "
            "(abstained=%s), provider=%r",
            course_name,
            assessment_type,
            num_items,
            len(chunks),
            rag_result["abstained"],
            provider,
        )

        # Step 2 — Build CoT prompt (token-efficient via progressive summary)
        system_prompt, user_prompt = CoTPromptBuilder.build_assessment_prompt(
            course_name=course_name,
            assessment_type=assessment_type,
            num_items=num_items,
            clos=clos,
            context_chunks=chunks,
            extra_instructions=extra_instructions,
            context_summary=rag_result["context_summary"],
        )

        # Step 3 — Call LLM
        llm = LLMService()
        generated_text, provider_used = llm.generate_response_with_fallback(
            messages=[{"role": "user", "content": user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=4000,
            return_provider=True,
        )

        return Response(
            {
                "success": True,
                "course_name": course_name,
                "assessment_type": assessment_type,
                "num_items": num_items,
                "clos_provided": clos,
                "provider_used": provider_used,
                "rag_chunks_used": len(chunks),
                "generated_assessment": generated_text,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception(
            "Error generating %s for course %r", assessment_type, course_name
        )
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
