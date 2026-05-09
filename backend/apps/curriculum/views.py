import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.rag_service import semantic_search

from .serializers import GenerateModuleSerializer, GenerateSyllabusSerializer

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_syllabus(request):
    """
    Generate a complete OBE-aligned course syllabus using RAG + CoT + LLM.

    Endpoint: POST /api/curriculum/generate-syllabus/

    Body (JSON):
    {
        "course_name": "Data Structures and Algorithms",
        "course_code": "CS 201",          // optional
        "num_weeks": 18,                  // optional, default 16
        "provider": "gemini",             // optional: gemini|gpt|groq|anthropic|openrouter
        "top_k": 5,                       // optional, RAG chunks to retrieve
        "search_query": "...",            // optional override for semantic search
        "extra_instructions": "..."       // optional faculty notes
    }

    Pipeline:
        1. Semantic search over the knowledge base with the course topic as query.
        2. CoT prompt builder assembles system + user prompts with retrieved context.
        3. LLMService sends the prompt to the configured provider.
        4. Generated syllabus text is returned in the response.
    """
    serializer = GenerateSyllabusSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    course_name = data["course_name"]
    course_code = data.get("course_code", "")
    num_weeks = data.get("num_weeks", 16)
    top_k = data.get("top_k", 5)
    provider = data.get("provider") or None
    extra_instructions = data.get("extra_instructions", "")
    search_query = data.get("search_query") or (
        f"{course_name} syllabus course outline curriculum learning outcomes OBE"
    )

    try:
        # Step 1 — Semantic search
        chunks = semantic_search(search_query, top_k=top_k)
        logger.info(
            "Syllabus generation for %r: retrieved %d RAG chunk(s) using provider=%r",
            course_name,
            len(chunks),
            provider,
        )

        # Step 2 — Build CoT prompt
        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_prompt(
            course_name=course_name,
            course_code=course_code,
            num_weeks=num_weeks,
            context_chunks=chunks,
            extra_instructions=extra_instructions,
        )

        # Step 3 — Call LLM
        llm = LLMService()
        generated_text = llm.generate_response(
            messages=[{"role": "user", "content": user_prompt}],
            provider_choice=provider,
            system=system_prompt,
            max_tokens=3000,
        )

        return Response(
            {
                "success": True,
                "course_name": course_name,
                "course_code": course_code,
                "num_weeks": num_weeks,
                "provider_used": provider or llm.default_provider,
                "rag_chunks_used": len(chunks),
                "generated_syllabus": generated_text,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error generating syllabus for %r", course_name)
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_module(request):
    """
    Generate a detailed OBE-aligned teaching module using RAG + CoT + LLM.

    Endpoint: POST /api/curriculum/generate-module/

    Body (JSON):
    {
        "course_name": "Data Structures and Algorithms",
        "module_title": "Binary Search Trees",
        "week_number": 7,                 // optional, default 1
        "provider": "gemini",             // optional
        "top_k": 5,                       // optional
        "search_query": "...",            // optional override
        "extra_instructions": "..."       // optional
    }

    Pipeline: same as generate_syllabus but targets a single weekly module.
    """
    serializer = GenerateModuleSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    course_name = data["course_name"]
    module_title = data["module_title"]
    week_number = data.get("week_number", 1)
    top_k = data.get("top_k", 5)
    provider = data.get("provider") or None
    extra_instructions = data.get("extra_instructions", "")
    search_query = data.get("search_query") or (
        f"{course_name} {module_title} teaching module learning outcomes activities"
    )

    try:
        # Step 1 — Semantic search
        chunks = semantic_search(search_query, top_k=top_k)
        logger.info(
            "Module generation for %r / %r (week %d): retrieved %d RAG chunk(s)",
            course_name,
            module_title,
            week_number,
            len(chunks),
        )

        # Step 2 — Build CoT prompt
        system_prompt, user_prompt = CoTPromptBuilder.build_module_prompt(
            course_name=course_name,
            module_title=module_title,
            week_number=week_number,
            context_chunks=chunks,
            extra_instructions=extra_instructions,
        )

        # Step 3 — Call LLM
        llm = LLMService()
        generated_text = llm.generate_response(
            messages=[{"role": "user", "content": user_prompt}],
            provider_choice=provider,
            system=system_prompt,
            max_tokens=2500,
        )

        return Response(
            {
                "success": True,
                "course_name": course_name,
                "module_title": module_title,
                "week_number": week_number,
                "provider_used": provider or llm.default_provider,
                "rag_chunks_used": len(chunks),
                "generated_module": generated_text,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception(
            "Error generating module %r for course %r", module_title, course_name
        )
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
