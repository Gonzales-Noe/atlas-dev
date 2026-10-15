import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0026_syllabus_template_and_faculty_name'),
        ('integrations', '0027_courseload_section_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='globaldocument',
            name='institution',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='knowledge_documents',
                to='integrations.institution',
            ),
        ),
    ]
