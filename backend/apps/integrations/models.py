import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone
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

class ApplicationStatusEnum(models.TextChoices):
    PENDING_REVIEW = 'pending_review', 'Pending review'
    APPROVED_PENDING_PAYMENT = 'approved_pending_payment', 'Approved - payment due'
    ACTIVE = 'active', 'Active'
    REJECTED = 'rejected', 'Rejected'

class PaymentStatusEnum(models.TextChoices):
    UNPAID = 'unpaid', 'Unpaid'
    PENDING = 'pending', 'Payment pending'
    PAID = 'paid', 'Paid'

class UserRole(models.TextChoices):
    SUPERADMIN = 'super_admin', 'Super Admin'
    ADMIN = 'admin', 'Admin'
    FACULTY = 'faculty', 'Faculty'
    STUDENT = 'student', 'Student'

class Institution(models.Model):
    institution_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    plan_tier = models.CharField(max_length=50, choices=PlanTierEnum.choices, default=PlanTierEnum.FREE)
    subscription_status = models.CharField(max_length=50, choices=SubscriptionStatusEnum.choices, default=SubscriptionStatusEnum.ACTIVE)
    application_status = models.CharField(max_length=40, choices=ApplicationStatusEnum.choices, default=ApplicationStatusEnum.ACTIVE)
    payment_status = models.CharField(max_length=20, choices=PaymentStatusEnum.choices, default=PaymentStatusEnum.PAID)
    selected_plan = models.CharField(max_length=50, blank=True, default='')
    payment_method = models.CharField(max_length=30, blank=True, default='')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    trial_started_at = models.DateTimeField(null=True, blank=True)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    subscription_ends_at = models.DateTimeField(null=True, blank=True)
    paymongo_customer_id = models.CharField(max_length=80, blank=True, default='')
    paymongo_subscription_id = models.CharField(max_length=80, blank=True, default='')
    paymongo_checkout_session_id = models.CharField(max_length=80, blank=True, default='')
    paymongo_reference_number = models.CharField(max_length=120, blank=True, default='')
    paymongo_checkout_url = models.URLField(blank=True, default='')
    paymongo_last_event_id = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    setup_completed = models.BooleanField(default=False)
    setup_completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'institution'

class InstitutionCustomization(models.Model):
    institution = models.OneToOneField(Institution, on_delete=models.CASCADE, related_name='customization')
    header_image_url = models.TextField(blank=True, default='')
    footer_image_url = models.TextField(blank=True, default='')
    header_text = models.CharField(max_length=500, blank=True, default='')
    footer_text = models.CharField(max_length=500, blank=True, default='')
    syllabus_template_name = models.CharField(max_length=255, blank=True, default='')
    # Exact uploaded sample (docx / pdf / xlsx) — what admins click in the preview
    syllabus_template = models.FileField(upload_to='syllabus_templates/', blank=True)
    syllabus_template_kind = models.CharField(max_length=16, blank=True, default='')
    # Working DOCX used when filling faculty exports (same bytes when upload was already DOCX)
    syllabus_working_docx = models.FileField(upload_to='syllabus_templates/working/', blank=True)
    syllabus_sections = models.JSONField(default=list, blank=True)
    syllabus_style_profile = models.JSONField(default=dict, blank=True)
    # Click-mapped regions: sections with title_region_id + content_region_id (+ click_log)
    syllabus_field_map = models.JSONField(default=dict, blank=True)
    # Cached click targets for the uploaded file (admin click UI)
    syllabus_preview_blocks = models.JSONField(default=list, blank=True)
    field_labels = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'institution_customization'

class UserProfile(models.Model):
    # This maps to your 'users' table
    user_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.SET_NULL, null=True, blank=True, db_column='institution_id')
    college = models.ForeignKey('College', on_delete=models.SET_NULL, null=True, blank=True, db_column='college_id', related_name='faculty')
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True, default='')
    password_hash = models.CharField(max_length=255)
    role = models.CharField(max_length=50, choices=UserRole.choices, default=UserRole.FACULTY)
    trial_generation_count = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    picture_url = models.URLField(max_length=500, blank=True, null=True)

    class Meta:
        db_table = 'users'

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    @property
    def username(self):
        return self.email

    @property
    def name(self):
        if self.full_name.strip():
            return self.full_name.strip()
        local_part = self.email.split('@', 1)[0]
        return local_part.replace('.', ' ').replace('_', ' ').title()

class College(models.Model):
    """A college/unit within an institution, e.g. College of Engineering."""
    college_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE, related_name='colleges')
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'college'
        ordering = ('name',)
        constraints = [
            models.UniqueConstraint(fields=['institution', 'code'], name='uniq_college_code_per_institution'),
            models.UniqueConstraint(fields=['institution', 'name'], name='uniq_college_name_per_institution'),
        ]

    def __str__(self):
        return f'{self.code} - {self.name}'


class Program(models.Model):
    """A degree program offered by a college, e.g. BS Computer Science."""
    program_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE, related_name='programs')
    college = models.ForeignKey(College, on_delete=models.CASCADE, related_name='programs')
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'program'
        ordering = ('name',)
        constraints = [
            models.UniqueConstraint(fields=['institution', 'code'], name='uniq_program_code_per_institution'),
            models.UniqueConstraint(fields=['college', 'name'], name='uniq_program_name_per_college'),
        ]

    def __str__(self):
        return f'{self.code} - {self.name}'


class YearLevel(models.Model):
    """A year level (1st Year, 2nd Year, …) belonging to a program."""
    year_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='year_levels')
    year_number = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        db_table = 'year_level'
        ordering = ('year_number',)
        constraints = [
            models.UniqueConstraint(fields=['program', 'year_number'], name='uniq_year_number_per_program'),
        ]

    def __str__(self):
        return self.label or f'Year {self.year_number}'

    @property
    def display_name(self):
        return self.label or f'Year {self.year_number}'


YEAR_LEVEL_CHOICES = (
    (1, '1st Year'),
    (2, '2nd Year'),
    (3, '3rd Year'),
    (4, '4th Year'),
    (5, '5th Year'),
    (6, '6th Year'),
)


class Section(models.Model):
    """A section/block (BSCS-1A), usually under a program year level, and the courses it takes.

    Sections created ad hoc by name (faculty rosters, course assignment) have no
    program or year level; they are scoped by `institution` instead (null = shared).
    `year_number` carries the year for those ad-hoc sections, which have no
    program-owned YearLevel to point at.
    """
    section_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(
        Institution, on_delete=models.CASCADE, null=True, blank=True,
        db_column='institution_id', related_name='sections',
    )
    program = models.ForeignKey(Program, on_delete=models.CASCADE, null=True, blank=True, related_name='sections')
    year_level = models.ForeignKey(YearLevel, on_delete=models.CASCADE, null=True, blank=True, related_name='sections')
    year_number = models.PositiveSmallIntegerField(null=True, blank=True, choices=YEAR_LEVEL_CHOICES)
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100, blank=True, default='')
    taken_courses = models.ManyToManyField(
        'Course', related_name='taking_sections', blank=True, db_table='section_courses',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'academic_section'
        ordering = ('code',)
        constraints = [
            models.UniqueConstraint(fields=['year_level', 'code'], name='uniq_section_code_per_year'),
        ]

    def __str__(self):
        return self.code

    @property
    def section_name(self) -> str:
        return self.code

    @property
    def year_label(self) -> str:
        if self.year_number:
            return dict(YEAR_LEVEL_CHOICES).get(self.year_number, f'Year {self.year_number}')
        if self.year_level_id:
            return self.year_level.display_name
        return ''


class CourseCategory(models.TextChoices):
    GED = 'ged', 'General Education'
    COMMON = 'common', 'Common Courses'
    PROFESSIONAL = 'professional', 'Professional Courses'
    MANDATED = 'mandated', 'Mandated Courses'


class Course(models.Model):
    course_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE, null=True, blank=True, related_name='courses')
    program = models.ForeignKey(Program, on_delete=models.CASCADE, null=True, blank=True, related_name='courses')
    year_level = models.ForeignKey(YearLevel, on_delete=models.SET_NULL, null=True, blank=True, related_name='courses')
    section = models.ForeignKey(Section, on_delete=models.SET_NULL, null=True, blank=True, related_name='courses')
    course_code = models.CharField(max_length=100)
    course_title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    category = models.CharField(max_length=20, choices=CourseCategory.choices, default=CourseCategory.PROFESSIONAL)
    units = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    # Syllabus section (and optional subsection) the Module tab reads its
    # topics from. Locked once `module_topic_confirmed_at` is set.
    module_topic_section_key = models.CharField(max_length=120, blank=True, default='')
    module_topic_subsection_key = models.CharField(max_length=120, blank=True, default='')
    module_topic_confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'course'
        ordering = ('course_code',)
        constraints = [
            models.UniqueConstraint(fields=['institution', 'course_code'], name='uniq_course_code_per_institution'),
        ]

    def __str__(self):
        return f'{self.course_code} - {self.course_title}'


class CourseRequestStatus(models.TextChoices):
    PENDING = 'pending', 'Pending review'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'


class CourseRequest(models.Model):
    """A faculty-submitted proposal for a new course.

    Faculty cannot create live Course rows directly — they file a request
    here and an institution admin approves/rejects it. On approval the
    backend materialises the real Course + CourseLoad rows.
    """
    request_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE, related_name='course_requests')
    requested_by = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='course_requests')
    course_code = models.CharField(max_length=100)
    course_title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    category = models.CharField(max_length=20, choices=CourseCategory.choices, default=CourseCategory.PROFESSIONAL)
    units = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    section = models.ForeignKey(Section, on_delete=models.SET_NULL, null=True, blank=True, related_name='course_requests')
    justification = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=CourseRequestStatus.choices, default=CourseRequestStatus.PENDING)
    admin_note = models.TextField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        UserProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_course_requests',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_course = models.ForeignKey(
        Course, on_delete=models.SET_NULL, null=True, blank=True, related_name='creation_requests',
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'course_request'
        ordering = ('-created_at',)

    def __str__(self):
        return f'{self.course_code} - {self.course_title} ({self.status})'


class CourseLoad(models.Model):
    assignment_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    faculty = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    section = models.ForeignKey(
        Section, on_delete=models.SET_NULL, null=True, blank=True,
        db_column='section_id', related_name='course_loads',
    )

    class Meta:
        db_table = 'course_load'
        unique_together = ('course', 'faculty', 'section')

    @property
    def section_name(self) -> str:
        return self.section.section_name if self.section_id else ''

class Ilo(models.Model):
    ilo_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    ilo_code = models.CharField(max_length=50)
    ilo_description = models.TextField()
    bloom_level = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Bloom's Taxonomy level: Remember/Understand/Apply/Analyze/Evaluate/Create",
    )
    bloom_verb = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="First action verb detected in the ILO statement",
    )

    class Meta:
        db_table = 'ilo'

class Syllabus(models.Model):
    syllabus_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    term = models.CharField(max_length=100)
    version = models.IntegerField(default=1)
    status = models.CharField(max_length=50, default='Draft')
    generated_at = models.DateTimeField(null=True, blank=True)
    syllabus_content = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'syllabi'

class Module(models.Model):
    module_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    syllabus = models.ForeignKey(Syllabus, on_delete=models.CASCADE)
    module_title = models.CharField(max_length=255)
    week_number = models.IntegerField()
    status = models.CharField(max_length=50, default='Draft')
    generated_at = models.DateTimeField(null=True, blank=True)
    module_content = models.JSONField(null=True, blank=True)

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
    qa_report = models.JSONField(null=True, blank=True)

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

class AssessmentScoreResult(models.Model):
    result_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE)
    mapping_id = models.UUIDField(null=True, blank=True)
    # SR code (e.g. "23-35007"). Same identifier as bubble_sheet_scans.student_identifier.
    student_identifier = models.CharField(max_length=64, db_index=True)
    score = models.DecimalField(max_digits=5, decimal_places=2)
    performance = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'assessment_score_results'

class StudentData(models.Model):
    student_data_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, db_column='user_id')
    courses_enrolled = models.JSONField(default=list)
    sr_code = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True, db_column='sr_code')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_data'

class Block(models.Model):
    """Class roster: which grade level and section each student ID belongs to."""
    block_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    grade_level = models.CharField(max_length=100, blank=True, default='')
    section = models.ForeignKey(
        Section, on_delete=models.SET_NULL, null=True, blank=True,
        db_column='section_id', related_name='blocks',
    )
    # Same value as bubble_sheet_scans.student_identifier (e.g. "23-35007").
    student_id = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'blocks'

    @property
    def section_name(self) -> str:
        return self.section.section_name if self.section_id else ''

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
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

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
    class IndexStatus(models.TextChoices):
        PROCESSING = 'PROCESSING', 'Processing'
        READY = 'READY', 'Ready'
        FAILED = 'FAILED', 'Failed'

    document_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(
        Institution, on_delete=models.CASCADE, null=True, blank=True,
        related_name='knowledge_documents',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    # Metadata for filtered retrieval
    discipline = models.CharField(max_length=100, null=True, blank=True)  # e.g. 'Engineering'
    program = models.CharField(max_length=100, null=True, blank=True)     # e.g. 'BSCS'
    doc_type = models.CharField(max_length=50, null=True, blank=True)     # e.g. 'CHED_Handbook'
    status = models.CharField(
        max_length=20, choices=IndexStatus.choices, default=IndexStatus.READY,
        db_default=IndexStatus.READY,
    )
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'global_document'


class GlobalDocumentChunk(models.Model):
    CHUNK_ROLE_CHOICES = [('PARENT', 'Parent'), ('CHILD', 'Child')]

    chunk_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(GlobalDocument, on_delete=models.CASCADE)

    # Self-referential FK: CHILD chunks point to their PARENT chunk.
    # PARENT chunks have parent=None.
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
    )

    chunk_role = models.CharField(
        max_length=20, choices=CHUNK_ROLE_CHOICES, null=True, blank=True
    )

    page_number = models.IntegerField(null=True, blank=True)
    text_content = models.TextField()
    token_count = models.IntegerField(null=True, blank=True)

    # BGE-Base-v1.5 uses 768 dimensions.
    # PARENT chunks store no embedding (None); CHILD chunks store full embeddings.
    embedding_vector = VectorField(dimensions=768, null=True, blank=True)

    class Meta:
        db_table = 'global_document_chunk'
