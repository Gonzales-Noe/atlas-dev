# Generated migration: Parent-Child RAG schema upgrade
#
# Changes:
#   global_document   → +discipline, +program, +doc_type
#   global_document_chunk → +parent (self-FK), +chunk_role, +token_count
#                          embedding_vector dim: 1536 → 768 (BGE-Base-v1.5)
#   Indexes:
#     HNSW cosine on child embedding vectors (partial: chunk_role='CHILD')
#     B-tree on global_document(discipline, program, doc_type)
#
# NOTE: All existing embedding_vector values are dropped during this migration.
#       Documents must be re-uploaded to re-index with the new 768-dim model.

import django.db.models.deletion
import pgvector.django
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("integrations", "0004_auto_20260508_0944"),
    ]

    operations = [
        # ── GlobalDocument: metadata columns ───────────────────────────────
        migrations.AddField(
            model_name="globaldocument",
            name="discipline",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name="globaldocument",
            name="program",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name="globaldocument",
            name="doc_type",
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        # ── GlobalDocumentChunk: parent self-FK, role, token count ─────────
        migrations.AddField(
            model_name="globaldocumentchunk",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="children",
                to="integrations.globaldocumentchunk",
            ),
        ),
        migrations.AddField(
            model_name="globaldocumentchunk",
            name="chunk_role",
            field=models.CharField(
                blank=True,
                choices=[("PARENT", "Parent"), ("CHILD", "Child")],
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="globaldocumentchunk",
            name="token_count",
            field=models.IntegerField(blank=True, null=True),
        ),
        # ── Swap embedding_vector from 1536-dim to 768-dim ─────────────────
        # Step 1: Raw SQL — drop old column, add new 768-dim column.
        migrations.RunSQL(
            sql=[
                "ALTER TABLE global_document_chunk DROP COLUMN IF EXISTS embedding_vector;",
                "ALTER TABLE global_document_chunk ADD COLUMN embedding_vector vector(768);",
            ],
            reverse_sql=[
                "ALTER TABLE global_document_chunk DROP COLUMN IF EXISTS embedding_vector;",
                "ALTER TABLE global_document_chunk ADD COLUMN embedding_vector vector(1536);",
            ],
        ),
        # Step 2: Update Django model state only (DB already changed above).
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(
                    model_name="globaldocumentchunk",
                    name="embedding_vector",
                ),
                migrations.AddField(
                    model_name="globaldocumentchunk",
                    name="embedding_vector",
                    field=pgvector.django.VectorField(
                        blank=True, dimensions=768, null=True
                    ),
                ),
            ],
            database_operations=[],
        ),
        # ── Indexes ────────────────────────────────────────────────────────
        # HNSW cosine index only on CHILD rows (the ones with embeddings).
        migrations.RunSQL(
            sql=(
                "CREATE INDEX IF NOT EXISTS idx_chunk_embedding "
                "ON global_document_chunk "
                "USING hnsw (embedding_vector vector_cosine_ops) "
                "WHERE chunk_role = 'CHILD';"
            ),
            reverse_sql="DROP INDEX IF EXISTS idx_chunk_embedding;",
        ),
        # Filter index on document metadata for discipline/program/doc_type queries.
        migrations.RunSQL(
            sql=(
                "CREATE INDEX IF NOT EXISTS idx_global_document_metadata "
                "ON global_document (discipline, program, doc_type);"
            ),
            reverse_sql="DROP INDEX IF EXISTS idx_global_document_metadata;",
        ),
    ]
