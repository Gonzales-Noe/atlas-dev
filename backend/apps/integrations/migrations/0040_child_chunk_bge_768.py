# Course child chunks stored zero-padded 1536-dim copies of the 768-dim
# BGE-Base-v1.5 vectors used by global_document_chunk. Keep the real 768
# values and add the same HNSW cosine index the global table uses.

import pgvector.django
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0039_assessment_qa_report'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "ALTER TABLE child_chunk ADD COLUMN embedding_vector_768 vector(768);",
                """
                UPDATE child_chunk
                SET embedding_vector_768 = (
                    '[' || array_to_string(
                        (string_to_array(btrim(embedding_vector::text, '[]'), ','))[1:768],
                        ','
                    ) || ']'
                )::vector(768)
                WHERE embedding_vector IS NOT NULL;
                """,
                "ALTER TABLE child_chunk DROP COLUMN embedding_vector;",
                "ALTER TABLE child_chunk RENAME COLUMN embedding_vector_768 TO embedding_vector;",
                """
                CREATE INDEX IF NOT EXISTS idx_child_chunk_embedding
                ON child_chunk
                USING hnsw (embedding_vector vector_cosine_ops);
                """,
            ],
            reverse_sql=[
                "DROP INDEX IF EXISTS idx_child_chunk_embedding;",
                "ALTER TABLE child_chunk DROP COLUMN IF EXISTS embedding_vector;",
                "ALTER TABLE child_chunk ADD COLUMN embedding_vector vector(1536);",
            ],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='childchunk',
                    name='embedding_vector',
                    field=pgvector.django.VectorField(
                        blank=True, dimensions=768, null=True,
                    ),
                ),
            ],
            database_operations=[],
        ),
    ]
