from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0020_alter_institutioncustomization_images'),
    ]

    operations = [
        migrations.AddField(
            model_name='institution', name='application_status',
            field=models.CharField(choices=[('pending_review', 'Pending review'), ('approved_pending_payment', 'Approved - payment due'), ('active', 'Active'), ('rejected', 'Rejected')], default='active', max_length=40),
        ),
        migrations.AddField(
            model_name='institution', name='payment_status',
            field=models.CharField(choices=[('unpaid', 'Unpaid'), ('pending', 'Payment pending'), ('paid', 'Paid')], default='paid', max_length=20),
        ),
        migrations.AddField(model_name='institution', name='selected_plan', field=models.CharField(blank=True, default='', max_length=50)),
        migrations.AddField(model_name='institution', name='payment_method', field=models.CharField(blank=True, default='', max_length=30)),
        migrations.AddField(model_name='institution', name='reviewed_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='institution', name='paid_at', field=models.DateTimeField(blank=True, null=True)),
    ]