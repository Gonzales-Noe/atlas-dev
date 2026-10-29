from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0041_course_syllabus_owner_module_faculty'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='institution',
            index=models.Index(fields=['application_status'], name='institution_app_status_idx'),
        ),
        migrations.AddIndex(
            model_name='institution',
            index=models.Index(fields=['payment_status'], name='institution_pay_status_idx'),
        ),
        migrations.AddIndex(
            model_name='userprofile',
            index=models.Index(fields=['institution', 'role'], name='users_institution_role_idx'),
        ),
        migrations.AddIndex(
            model_name='userprofile',
            index=models.Index(fields=['institution', 'is_active'], name='users_institution_active_idx'),
        ),
        migrations.AddIndex(
            model_name='course',
            index=models.Index(fields=['institution', 'is_active'], name='course_institution_active_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['-timestamp'], name='audit_logs_timestamp_desc_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['user', '-timestamp'], name='audit_logs_user_ts_idx'),
        ),
        migrations.AddIndex(
            model_name='globaldocument',
            index=models.Index(fields=['institution', 'status'], name='global_doc_inst_status_idx'),
        ),
    ]
