import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.rag_service import semantic_search

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
        "provider": "gemini",                    // optional
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
        # Step 1 — Semantic search
        chunks = semantic_search(search_query, top_k=top_k)
        logger.info(
            "Assessment generation for %r (%s, %d items): retrieved %d RAG chunk(s), provider=%r",
            course_name,
            assessment_type,
            num_items,
            len(chunks),
            provider,
        )

        # Step 2 — Build CoT prompt
        system_prompt, user_prompt = CoTPromptBuilder.build_assessment_prompt(
            course_name=course_name,
            assessment_type=assessment_type,
            num_items=num_items,
            clos=clos,
            context_chunks=chunks,
            extra_instructions=extra_instructions,
        )

        # Step 3 — Call LLM
        llm = LLMService()
        generated_text = llm.generate_response(
            messages=[{"role": "user", "content": user_prompt}],
            provider_choice=provider,
            system=system_prompt,
            max_tokens=4000,
        )

        return Response(
            {
                "success": True,
                "course_name": course_name,
                "assessment_type": assessment_type,
                "num_items": num_items,
                "clos_provided": clos,
                "provider_used": provider or llm.default_provider,
                "rag_chunks_used": len(chunks),
                "generated_assessment": generated_text,
            },
            status=status.HTTP_200_OK,
        )

    except ValueError as exc:
        logger.warning(
            "Provider configuration error generating %s for course %r: %s",
            assessment_type,
            course_name,
            exc,
        )
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as exc:
        logger.exception(
            "Error generating %s for course %r", assessment_type, course_name
        )
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
