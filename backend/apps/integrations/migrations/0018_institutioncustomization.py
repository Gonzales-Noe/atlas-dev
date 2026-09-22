from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0017_courseload_section'),
    ]

    operations = [
        migrations.CreateModel(
            name='InstitutionCustomization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('header_text', models.CharField(blank=True, default='', max_length=500)),
                ('footer_text', models.CharField(blank=True, default='', max_length=500)),
                ('syllabus_sections', models.JSONField(blank=True, default=list)),
                ('field_labels', models.JSONField(blank=True, default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('institution', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='customization', to='integrations.institution')),
            ],
            options={'db_table': 'institution_customization'},
        ),
    ]
