// src/features/Faculty/Syllabus.jsx
import { useEffect, useState } from 'react'
import { 
  Box, Button, Card, CardContent, Stack, TextField, Typography, 
  Alert, Stepper, Step, StepLabel, CircularProgress, Grid 
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HomeIcon from '@mui/icons-material/Home'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CreateIcon from '@mui/icons-material/Create'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import FacultyLayout from './FacultyLayout'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../config/route'

function loadCourse() { 
  try { return JSON.parse(localStorage.getItem('atlas_faculty_course')) || null } 
  catch { return null } 
}

const steps = [
  'Course Info', 
  'Course Description', 
  'Learning Outcomes', 
  'Course Policies', 
  'TLA Schedule', 
  'Review & Save'
];

export default function FacultySyllabus() {
  const navigate = useNavigate();
  const [course, setCourse] = useState(loadCourse());
  const [syllabusCreated, setSyllabusCreated] = useState(localStorage.getItem('atlas_faculty_syllabus_created') === 'true');
  
  // Setup Modes: 'choice', 'wizard', 'upload'
  const [setupMode, setSetupMode] = useState('choice'); 
  const [activeStep, setActiveStep] = useState(0);

  // Form States based on CIS CSV
  const [courseInfo, setCourseInfo] = useState({ 
    title: course?.courseName || '', 
    code: course?.courseCode || '', 
    category: '', 
    preReq: '', 
    credits: '' 
  });
  const [description, setDescription] = useState('');
  const [ilos, setIlos] = useState('');
  
  // Pre-filled standard institutional policies based on the CSV reference
  const [policies, setPolicies] = useState(
    "A. GRADING SYSTEM\nExcellent 1.00 (98-100)\nPassing 3.00 (75-77)\nFailure 5.00 (Below 70)\n\n" +
    "B. CLASS POLICY\n- Prompt and regular attendance is required. Unexcused absences shall not exceed 10%.\n- Missed Exams: Valid reason and medical certificate required.\n- Academic Dishonesty: Plagiarism and cheating are major offenses.\n\n" +
    "C. OTHER COURSE POLICIES\n- Proper Conduct and Classroom Discipline.\n- AI tools may be used only as supplementary support (70% original work).\n- Uniform and Proper Attire required."
  );
  
  const [schedule, setSchedule] = useState('');

  // AI Loading States
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingILOs, setGeneratingILOs] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);

  useEffect(() => { 
    setCourse(loadCourse());
  }, []);

  function handleSaveSyllabus() {
    localStorage.setItem('atlas_faculty_syllabus_created', 'true');
    setSyllabusCreated(true);
    setSetupMode('choice');
    setActiveStep(0);
  }

  // Mock AI Generation Functions
  function generateDescWithAI() {
    setGeneratingDesc(true);
    setTimeout(() => {
      setDescription(`This course equips students with essential skills to implement advanced analytics techniques that support data-driven decision-making. Students are introduced to key concepts including classification, clustering, association rules, financial forecasting, and predictive modeling using industry-standard tools.`);
      setGeneratingDesc(false);
    }, 1500);
  }

  function generateILOsWithAI() {
    setGeneratingILOs(true);
    setTimeout(() => {
      setIlos("ILO1: Apply advanced analytics techniques, including regression, classification, clustering, and association rules.\nILO2: Develop and implement predictive models using Python, R, Excel and KNIME.\nILO3: Explain the insights of an analytical model from problem identification to evaluation.");
      setGeneratingILOs(false);
    }, 1500);
  }

  function generateScheduleWithAI() {
    setGeneratingSchedule(true);
    setTimeout(() => {
      setSchedule("Week 1: Class Orientation & Introduction to Analytical Tools\nWeek 2-3: Customer Analytics & Classification Models (Python)\nWeek 4-6: Market Segmentation & Clustering Models (R)\nWeek 7-9: Market Basket Analytics & Association Rules (KNIME)\nWeek 10-12: Financial Forecasting Techniques (Excel)\nWeek 13-14: Natural Language Processing (NLP)\nWeek 15-16: Advanced Predictive Analytics & Final Project");
      setGeneratingSchedule(false);
    }, 1500);
  }

  const cardStyles = { borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 8px 32px rgba(0,0,0,0.04)', mb: 3 };
  const inputStyles = { '& .MuiOutlinedInput-root': { borderRadius: '12px', backgroundColor: '#F8FAFC' } };

  // ==========================================
  // VIEW 1: SYLLABUS COMPLETED (Active State)
  // ==========================================
  // The Export button ONLY appears here, when the syllabus is already created.
  if (syllabusCreated) {
    return (
      <FacultyLayout>
        <Box sx={{ mb: 4, pt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
            Course Syllabus
          </Typography>
          <Typography sx={{ color: '#166534', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon fontSize="small" /> Syllabus active. All modules are unlocked.
          </Typography>
        </Box>

        <Card sx={cardStyles}>
          <CardContent sx={{ p: 5, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.8rem', color: '#0F172A', mb: 1 }}>
              {course?.courseName || 'Untitled Course'}
            </Typography>
            <Typography sx={{ color: '#64748B', mb: 4, fontSize: '1.1rem' }}>
              {course?.courseCode || 'No Code'} | Batangas State University Template
            </Typography>
            
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button variant="contained" startIcon={<FileDownloadIcon />} sx={{ background: '#10B981', '&:hover': { background: '#059669' }, borderRadius: '12px', textTransform: 'none', py: 1.5, px: 4, fontWeight: 700 }}>
                Export to Excel / Sheets
              </Button>
              
              {/* Replace existing syllabus options */}
              <Button variant="outlined" onClick={() => { setSyllabusCreated(false); setSetupMode('wizard'); setActiveStep(0); }} sx={{ borderRadius: '12px', textTransform: 'none', py: 1.5, px: 3, fontWeight: 700, borderColor: '#CBD5E1', color: '#0F172A' }}>
                Create Syllabus
              </Button>
              <Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={() => { setSyllabusCreated(false); setSetupMode('upload'); }} sx={{ borderRadius: '12px', textTransform: 'none', py: 1.5, px: 3, fontWeight: 700, borderColor: '#CBD5E1', color: '#0F172A' }}>
                Upload Syllabus
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </FacultyLayout>
    );
  }

  // ==========================================
  // VIEW 2: SYLLABUS SETUP WIZARD 
  // ==========================================
  return (
    <FacultyLayout>
      <Box sx={{ mb: 4, pt: 2 }}>
        <Button startIcon={<HomeIcon />} onClick={() => navigate(ROUTES.FACULTY.DASHBOARD)} sx={{ color: '#64748B', mb: 2, textTransform: 'none', fontWeight: 600, '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' } }}>
          Back to Dashboard
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
          Syllabus Setup Required
        </Typography>
        <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
          You must define the syllabus for <strong>{course?.courseName || 'this course'}</strong> before accessing modules and assessments.
        </Typography>
      </Box>

      {/* CHOICE SCREEN */}
      {setupMode === 'choice' && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardStyles, minHeight: 280, cursor: 'pointer', transition: 'all 0.2s ease', '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 12px 48px rgba(0,0,0,0.08)' } }} onClick={() => setSetupMode('wizard')}>
              <CardContent sx={{ p: 5, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#FFF1F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B0000', mb: 3 }}>
                  <CreateIcon fontSize="large" />
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A', mb: 1 }}>Create Syllabus</Typography>
                <Typography sx={{ color: '#475569', fontSize: '0.95rem', mb: 'auto' }}>Create your syllabus step-by-step matching the institutional CIS template. Use AI for heavy sections.</Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardStyles, minHeight: 280, cursor: 'pointer', transition: 'all 0.2s ease', '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 12px 48px rgba(0,0,0,0.08)' } }} onClick={() => setSetupMode('upload')}>
              <CardContent sx={{ p: 5, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', mb: 3 }}>
                  <UploadFileIcon fontSize="large" />
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A', mb: 1 }}>Upload Syllabus</Typography>
                <Typography sx={{ color: '#475569', fontSize: '0.95rem', mb: 'auto' }}>Upload the syllabus you created outside ATLAS. Supported formats: .xlsx, .csv, .pdf.</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* UPLOAD SCREEN */}
      {setupMode === 'upload' && (
        <Card sx={cardStyles}>
          <CardContent sx={{ p: 5 }}>
            <Button onClick={() => setSetupMode('choice')} sx={{ color: '#64748B', fontWeight: 600, textTransform: 'none', mb: 3 }}>← Back to Options</Button>
            <Stack spacing={3} alignItems="center" justifyContent="center" sx={{ minHeight: 250, border: '2px dashed #CBD5E1', borderRadius: '24px', backgroundColor: '#F8FAFC', p: 4 }}>
              <CloudUploadIcon sx={{ fontSize: 64, color: '#94A3B8' }} />
              <Typography sx={{ color: '#475569', textAlign: 'center', maxWidth: 400 }}>
                Drag and drop your syllabus file here, or click to browse. Supported formats: .xlsx, .csv, .pdf
              </Typography>
              <Button variant="contained" onClick={handleSaveSyllabus} sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' }, borderRadius: '12px', textTransform: 'none', py: 1.2, px: 4, fontWeight: 700 }}>
                Simulate Upload & Save
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* WIZARD PROGRESS BAR SCREEN */}
      {setupMode === 'wizard' && (
        <Card sx={cardStyles}>
          <Box sx={{ p: 4, borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', overflowX: 'auto' }}>
            <Stepper activeStep={activeStep} alternativeLabel sx={{ '& .MuiStepIcon-root.Mui-active': { color: '#8B0000' }, '& .MuiStepIcon-root.Mui-completed': { color: '#10B981' } }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel StepIconProps={{ sx: { fontSize: '1.5rem' } }}>
                    <Typography sx={{ fontWeight: 600, color: '#0F172A', mt: 0.5, fontSize: '0.85rem' }}>{label}</Typography>
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>

          <CardContent sx={{ p: 5, minHeight: 350 }}>
            
            {/* STEP 0: Course Info (NO AI BUTTON) */}
            {activeStep === 0 && (
              <Stack spacing={3} className="animate-fade-in" sx={{ maxWidth: '600px', mx: 'auto' }}>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A' }}>Course Information</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: '0.9rem' }}>Basic identification details required by the CIS template.</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                  <TextField label="Course Title" value={courseInfo.title} onChange={(e) => setCourseInfo({...courseInfo, title: e.target.value})} fullWidth size="medium" sx={inputStyles} />
                  <TextField label="Course Code" value={courseInfo.code} onChange={(e) => setCourseInfo({...courseInfo, code: e.target.value})} sx={{ width: '200px', ...inputStyles }} size="medium" />
                </Stack>
                <TextField label="Course Category (e.g. Professional Elective)" value={courseInfo.category} onChange={(e) => setCourseInfo({...courseInfo, category: e.target.value})} fullWidth size="medium" sx={inputStyles} />
                <TextField label="Pre-requisite(s)" value={courseInfo.preReq} onChange={(e) => setCourseInfo({...courseInfo, preReq: e.target.value})} fullWidth size="medium" sx={inputStyles} />
                <TextField label="Credit Hours" value={courseInfo.credits} onChange={(e) => setCourseInfo({...courseInfo, credits: e.target.value})} fullWidth size="medium" sx={inputStyles} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2 }}>
                  <Button variant="contained" onClick={() => setActiveStep(1)} sx={{ background: '#0F172A', '&:hover': { background: '#1E293B' }, borderRadius: '12px', textTransform: 'none', px: 4, py: 1.2, fontWeight: 700 }}>Next Step</Button>
                </Box>
              </Stack>
            )}

            {/* STEP 1: Course Description (WITH AI BUTTON) */}
            {activeStep === 1 && (
              <Stack spacing={3} className="animate-fade-in" sx={{ maxWidth: '800px', mx: 'auto' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A' }}>Course Rationale and Description</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.9rem' }}>A brief overview of the course contents and objectives.</Typography>
                  </Box>
                  <Button 
                    variant="contained" 
                    startIcon={generatingDesc ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />} 
                    onClick={generateDescWithAI}
                    disabled={generatingDesc}
                    sx={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  >
                    {generatingDesc ? 'Generating...' : 'Generate with ATLAS AI'}
                  </Button>
                </Box>
                <TextField label="Course Description Output" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={8} fullWidth sx={inputStyles} placeholder="This course equips students with essential skills..." />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2 }}>
                  <Button onClick={() => setActiveStep(0)} sx={{ color: '#64748B', fontWeight: 700, textTransform: 'none' }}>Back</Button>
                  <Button variant="contained" onClick={() => setActiveStep(2)} sx={{ background: '#0F172A', '&:hover': { background: '#1E293B' }, borderRadius: '12px', textTransform: 'none', px: 4, py: 1.2, fontWeight: 700 }}>Next Step</Button>
                </Box>
              </Stack>
            )}

            {/* STEP 2: ILOs (WITH AI BUTTON) */}
            {activeStep === 2 && (
              <Stack spacing={3} className="animate-fade-in" sx={{ maxWidth: '800px', mx: 'auto' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A' }}>Intended Learning Outcomes (ILO)</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.9rem' }}>Define what students will achieve upon completion of the course.</Typography>
                  </Box>
                  <Button 
                    variant="contained" 
                    startIcon={generatingILOs ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />} 
                    onClick={generateILOsWithAI}
                    disabled={generatingILOs}
                    sx={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  >
                    {generatingILOs ? 'Generating...' : 'Generate with ATLAS AI'}
                  </Button>
                </Box>
                <TextField label="ILOs Output" value={ilos} onChange={(e) => setIlos(e.target.value)} multiline rows={8} fullWidth sx={inputStyles} placeholder="ILO1: Apply advanced analytics techniques...\nILO2: Develop and implement predictive models..." />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2 }}>
                  <Button onClick={() => setActiveStep(1)} sx={{ color: '#64748B', fontWeight: 700, textTransform: 'none' }}>Back</Button>
                  <Button variant="contained" onClick={() => setActiveStep(3)} sx={{ background: '#0F172A', '&:hover': { background: '#1E293B' }, borderRadius: '12px', textTransform: 'none', px: 4, py: 1.2, fontWeight: 700 }}>Next Step</Button>
                </Box>
              </Stack>
            )}

            {/* STEP 3: Course Policies (NO AI BUTTON - Institutional Defaults) */}
            {activeStep === 3 && (
              <Stack spacing={3} className="animate-fade-in" sx={{ maxWidth: '800px', mx: 'auto' }}>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A' }}>Course Policies</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: '0.9rem' }}>Review the default institutional policies (Grading, Attendance, Conduct). Edit as needed for your specific class.</Typography>
                </Box>
                <TextField label="Policies" value={policies} onChange={(e) => setPolicies(e.target.value)} multiline rows={8} fullWidth sx={inputStyles} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2 }}>
                  <Button onClick={() => setActiveStep(2)} sx={{ color: '#64748B', fontWeight: 700, textTransform: 'none' }}>Back</Button>
                  <Button variant="contained" onClick={() => setActiveStep(4)} sx={{ background: '#0F172A', '&:hover': { background: '#1E293B' }, borderRadius: '12px', textTransform: 'none', px: 4, py: 1.2, fontWeight: 700 }}>Next Step</Button>
                </Box>
              </Stack>
            )}

            {/* STEP 4: TLA Schedule (WITH AI BUTTON) */}
            {activeStep === 4 && (
              <Stack spacing={3} className="animate-fade-in" sx={{ maxWidth: '800px', mx: 'auto' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A' }}>Teaching, Learning, and Assessment (TLA)</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.9rem' }}>Outline weekly topics, reading lists, and assessment tasks.</Typography>
                  </Box>
                  <Button 
                    variant="contained" 
                    startIcon={generatingSchedule ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />} 
                    onClick={generateScheduleWithAI}
                    disabled={generatingSchedule}
                    sx={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  >
                    {generatingSchedule ? 'Generating...' : 'Generate with ATLAS AI'}
                  </Button>
                </Box>
                <TextField label="TLA Schedule Output" value={schedule} onChange={(e) => setSchedule(e.target.value)} multiline rows={8} fullWidth sx={inputStyles} placeholder="Week 1: Class Orientation...\nWeek 2: Customer Analytics..." />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2 }}>
                  <Button onClick={() => setActiveStep(3)} sx={{ color: '#64748B', fontWeight: 700, textTransform: 'none' }}>Back</Button>
                  <Button variant="contained" onClick={() => setActiveStep(5)} sx={{ background: '#0F172A', '&:hover': { background: '#1E293B' }, borderRadius: '12px', textTransform: 'none', px: 4, py: 1.2, fontWeight: 700 }}>Next Step</Button>
                </Box>
              </Stack>
            )}

            {/* STEP 5: Review & Save */}
            {activeStep === 5 && (
              <Stack spacing={3} className="animate-fade-in" sx={{ maxWidth: '600px', mx: 'auto', textAlign: 'center', pt: 4 }}>
                <Box sx={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981', mx: 'auto', mb: 2 }}>
                  <CheckCircleIcon sx={{ fontSize: 48 }} />
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: '#0F172A' }}>Syllabus Ready to Save</Typography>
                <Typography sx={{ color: '#475569', fontSize: '1rem', mb: 4 }}>
                  You have successfully drafted the CIS Syllabus for <strong>{course?.courseName || courseInfo.title}</strong>. Saving will unlock the Module Builder and Assessment Generator for this course.
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 4, borderTop: '1px solid #E2E8F0' }}>
                  <Button onClick={() => setActiveStep(4)} sx={{ color: '#64748B', fontWeight: 700, textTransform: 'none' }}>Back to Edit</Button>
                  <Button variant="contained" onClick={handleSaveSyllabus} sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' }, borderRadius: '12px', textTransform: 'none', px: 5, py: 1.5, fontWeight: 800 }}>Save & Unlock Workflows</Button>
                </Box>
              </Stack>
            )}

          </CardContent>
        </Card>
      )}

    </FacultyLayout>
  )
}