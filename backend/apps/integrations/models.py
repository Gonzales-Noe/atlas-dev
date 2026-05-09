import uuid
from django.db import models
from pgvector.django import VectorField

class RagStatusEnum(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    PROCESSING = 'PROCESSING', 'Processing'
    COMPLETED = 'COMPLETED', 'Completed'
    FAILED = 'FAILED', 'Failed'

class PlanTierEnum(models.TextChoices):
    FREE = 'free', 'Free'
    PRO = 'pro', 'Pro'
    ENTERPRISE = 'enterprise', 'Enterprise'

class SubscriptionStatusEnum(models.TextChoices):
    ACTIVE = 'active', 'Active'
    CANCELED = 'canceled', 'Canceled'
    TRIALING = 'trialing', 'Trialing'

class UserRole(models.TextChoices):
    SUPERADMIN = 'super_admin', 'Super Admin'
    ADMIN = 'admin', 'Admin'
    FACULTY = 'faculty', 'Faculty'

class Institution(models.Model):
    institution_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    plan_tier = models.CharField(max_length=50, choices=PlanTierEnum.choices, default=PlanTierEnum.FREE)
    subscription_status = models.CharField(max_length=50, choices=SubscriptionStatusEnum.choices, default=SubscriptionStatusEnum.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'institution'

class UserProfile(models.Model):
    # This maps to your 'users' table
    user_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.SET_NULL, null=True, blank=True, db_column='institution_id')
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    role = models.CharField(max_length=50, choices=UserRole.choices, default=UserRole.FACULTY)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'users'

class Course(models.Model):
    course_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course_code = models.CharField(max_length=100, unique=True)
    course_title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'course'

class CourseLoad(models.Model):
    assignment_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    faculty = models.ForeignKey(UserProfile, on_delete=models.CASCADE)

    class Meta:
        db_table = 'course_load'
        unique_together = ('course', 'faculty')

class Ilo(models.Model):
    ilo_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    ilo_code = models.CharField(max_length=50)
    ilo_description = models.TextField()

    class Meta:
        db_table = 'ilo'

class Syllabus(models.Model):
    syllabus_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    term = models.CharField(max_length=100)
    version = models.IntegerField(default=1)
    status = models.CharField(max_length=50, default='Draft')
    generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'syllabi'

class Module(models.Model):
    module_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    syllabus = models.ForeignKey(Syllabus, on_delete=models.CASCADE)
    module_title = models.CharField(max_length=255)
    week_number = models.IntegerField()
    status = models.CharField(max_length=50, default='Draft')
    generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'modules'

class Assessment(models.Model):
    assessment_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    assessment_type = models.CharField(max_length=100)
    term = models.CharField(max_length=100)
    status = models.CharField(max_length=50, default='Draft')
    generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'assessments'

class AssessmentItem(models.Model):
    item_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE)
    module = models.ForeignKey(Module, on_delete=models.SET_NULL, null=True, blank=True)
    question_text = models.TextField()
    item_type = models.CharField(max_length=100)
    difficulty = models.CharField(max_length=50, null=True, blank=True)
    rubric = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'assessment_items'

class ItemIloMapping(models.Model):
    mapping_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(AssessmentItem, on_delete=models.CASCADE)
    ilo = models.ForeignKey(Ilo, on_delete=models.CASCADE)

    class Meta:
        db_table = 'item_ilo_mapping'
        unique_together = ('item', 'ilo')

class TosWeight(models.Model):
    tos_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE)
    module = models.ForeignKey(Module, on_delete=models.CASCADE)
    cognitive_level = models.CharField(max_length=100)
    weight_percentage = models.DecimalField(max_digits=5, decimal_places=2)
    computed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tos_weights'

class GradeSheetMapping(models.Model):
    mapping_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    term = models.CharField(max_length=100)
    google_sheet_url = models.URLField(max_length=2000, null=True, blank=True)
    weighting_schema = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'grade_sheet_mappings'

class AssessmentScoreResult(models.Model):
    result_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE)
    mapping = models.ForeignKey(GradeSheetMapping, on_delete=models.SET_NULL, null=True, blank=True)
    student_identifier = models.CharField(max_length=255)
    score = models.DecimalField(max_digits=5, decimal_places=2)
    performance = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'assessment_score_results'

class AnalyticsSnapshot(models.Model):
    snapshot_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    faculty = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    result = models.ForeignKey(AssessmentScoreResult, on_delete=models.SET_NULL, null=True, blank=True)
    snapshot_type = models.CharField(max_length=100)
    snapshot_data = models.JSONField()
    generated_at = models.DateTimeField(auto_now_add=True)
    is_saved = models.BooleanField(default=False)

    class Meta:
        db_table = 'analytics_snapshot'

class AuditLog(models.Model):
    log_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    action_type = models.CharField(max_length=100)
    resource_type = models.CharField(max_length=100, null=True, blank=True)
    resource_id = models.UUIDField(null=True, blank=True)
    details = models.JSONField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'

class CourseFile(models.Model):
    records_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    uploader = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    storage_path = models.TextField()
    rag_status = models.CharField(max_length=50, choices=RagStatusEnum.choices, default=RagStatusEnum.PENDING)

    class Meta:
        db_table = 'course_files'

class ParentChunk(models.Model):
    parent_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    records = models.ForeignKey(CourseFile, on_delete=models.CASCADE)
    uploader = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    module_tag = models.CharField(max_length=255, null=True, blank=True)
    term_tag = models.CharField(max_length=255, null=True, blank=True)
    parent_content = models.TextField()

    class Meta:
        db_table = 'parent_chunk'

class ChildChunk(models.Model):
    child_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(ParentChunk, on_delete=models.CASCADE)
    uploader = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    overlap_text = models.TextField(null=True, blank=True)
    embedding_vector = VectorField(dimensions=1536, null=True, blank=True)

    class Meta:
        db_table = 'child_chunk'

class GlobalDocument(models.Model):
    document_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'global_document'

class GlobalDocumentChunk(models.Model):
    chunk_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(GlobalDocument, on_delete=models.CASCADE)
    page_number = models.IntegerField(null=True, blank=True)
    text_content = models.TextField()
    embedding_vector = VectorField(dimensions=1536, null=True, blank=True)

    class Meta:
        db_table = 'global_document_chunk'
