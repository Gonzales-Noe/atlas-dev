# from django.core.management.base import BaseCommand
# from django.contrib.auth.hashers import make_password

# from apps.integrations.models import Course, CourseLoad, Institution, UserProfile, UserRole


# class Command(BaseCommand):
#     help = 'Seed predictable auth smoke-test data with hashed passwords.'

#     def add_arguments(self, parser):
#         parser.add_argument('--reset', action='store_true', help='Delete existing smoke-test data first.')

#     def handle(self, *args, **options):
#         institution, _ = Institution.objects.get_or_create(
#             name='ATLAS Smoke Institution',
#             defaults={
#                 'plan_tier': 'free',
#                 'subscription_status': 'active',
#                 'is_active': True,
#             },
#         )

#         institution.plan_tier = 'pro'
#         institution.subscription_status = 'active'
#         institution.is_active = True
#         institution.save(update_fields=['plan_tier', 'subscription_status', 'is_active'])

#         if options['reset']:
#             UserProfile.objects.filter(email__in=[
#                 'faculty.smoke@example.com',
#                 'admin.smoke@example.com',
#                 'superadmin.smoke@example.com',
#             ]).delete()
#             CourseLoad.objects.filter(faculty__email='faculty.smoke@example.com').delete()
#             Course.objects.filter(course_code='SMOKE101').delete()

#         # course, _ = Course.objects.get_or_create(
#         #     course_code='SMOKE101',
#         #     defaults={
#         #         'course_title': 'ATLAS Smoke Testing Fundamentals',
#         #         'description': 'Seed course used to verify role-based auth and dashboards.',
#         #     },
#         # )

#         # course.course_title = 'ATLAS Smoke Testing Fundamentals'
#         # course.description = 'Seed course used to verify role-based auth and dashboards.'
#         # course.save(update_fields=['course_title', 'description'])

#         credentials = [
#             {
#                 'email': 'faculty.smoke@example.com',
#                 'role': UserRole.FACULTY,
#                 'password': 'SmokePass123!',
#             },
#             {
#                 'email': 'admin.smoke@example.com',
#                 'role': UserRole.ADMIN,
#                 'password': 'SmokePass123!',
#             },
#             {
#                 'email': 'superadmin.smoke@example.com',
#                 'role': UserRole.SUPERADMIN,
#                 'password': 'SmokePass123!',
#             },
#         ]

#         created = []
#         for account in credentials:
#             user, _ = UserProfile.objects.update_or_create(
#                 email=account['email'],
#                 defaults={
#                     'institution': institution,
#                     'password_hash': make_password(account['password']),
#                     'role': account['role'],
#                     'is_active': True,
#                 },
#             )
#             created.append(user)

#         faculty = next(user for user in created if user.email == 'faculty.smoke@example.com')
#         CourseLoad.objects.get_or_create(course=course, faculty=faculty)

#         self.stdout.write(self.style.SUCCESS('Seeded smoke-test auth data.'))
#         self.stdout.write('Credentials:')
#         for account in credentials:
#             self.stdout.write(f"  {account['email']} / {account['password']}")
