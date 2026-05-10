// src/features/Faculty/Module.jsx
import { useEffect, useState } from 'react'
import { 
  Box, Button, Card, CardContent, Stack, TextField, Typography, 
  Alert, Grid, Chip, IconButton, CircularProgress 
} from '@mui/material'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import LockIcon from '@mui/icons-material/Lock'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import SchoolIcon from '@mui/icons-material/School'
import FacultyLayout from './FacultyLayout'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../config/route'

function loadCourse() { 
  try { return JSON.parse(localStorage.getItem('atlas_faculty_course')) || null } 
  catch { return null } 
}

// Automatically derived from the Syllabus TLA Schedule
const defaultSyllabusModules = [
  { id: 1, week: 'Week 1', title: 'Class Orientation & Intro to Analytics', status: 'Pending', lessonPlan: '', studyGuide: '' },
  { id: 2, week: 'Week 2-3', title: 'Customer Analytics & Classification Models', status: 'Pending', lessonPlan: '', studyGuide: '' },
  { id: 3, week: 'Week 4-6', title: 'Market Segmentation & Clustering Models', status: 'Pending', lessonPlan: '', studyGuide: '' },
  { id: 4, week: 'Week 7-9', title: 'Market Basket Analytics & Association Rules', status: 'Pending', lessonPlan: '', studyGuide: '' },
  { id: 5, week: 'Week 10-12', title: 'Financial Forecasting Techniques', status: 'Pending', lessonPlan: '', studyGuide: '' },
];

function loadModuleList() { 
  try { 
    const saved = JSON.parse(localStorage.getItem('atlas_faculty_modules'));
    return saved && saved.length > 0 ? saved : defaultSyllabusModules;
  } catch { 
    return defaultSyllabusModules; 
  } 
}

export default function FacultyModule() {
  const navigate = useNavigate();
  const [course, setCourse] = useState(loadCourse())
  const [syllabusReady, setSyllabusReady] = useState(localStorage.getItem('atlas_faculty_syllabus_created') === 'true')
  const [moduleList, setModuleList] = useState(loadModuleList())
  
  // State for the active module being edited in the workspace
  const [activeModuleId, setActiveModuleId] = useState(null)
  
  // AI Loading States
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [generatingGuide, setGeneratingGuide] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState('')

  useEffect(() => {
    setCourse(loadCourse())
    setSyllabusReady(localStorage.getItem('atlas_faculty_syllabus_created') === 'true')
  }, [])

  const activeModule = moduleList.find(m => m.id === activeModuleId);

  function handleUpdateActiveModule(field, value) {
    const updatedList = moduleList.map(m => 
      m.id === activeModuleId ? { ...m, [field]: value, status: 'Drafting' } : m
    );
    setModuleList(updatedList);
  }

  function handleSaveModule(markAsReady = false) {
    const updatedList = moduleList.map(m => 
      m.id === activeModuleId ? { ...m, status: markAsReady ? 'Ready' : 'Drafting' } : m
    );
    setModuleList(updatedList);
    localStorage.setItem('atlas_faculty_modules', JSON.stringify(updatedList));
    
    setSaveSuccess(markAsReady ? 'Module published successfully!' : 'Module draft saved.');
    setTimeout(() => setSaveSuccess(''), 3000);
    
    if (markAsReady) setActiveModuleId(null); // Return to grid if published
  }

  // AI Generation Mocks
  function generateLessonPlan() {
    setGeneratingPlan(true);
    setTimeout(() => {
      handleUpdateActiveModule('lessonPlan', "1. Learning Objectives Overview (15 mins)\n2. Interactive Concept Discussion (45 mins)\n3. Case Study Analysis (30 mins)\n4. Hands-on Software Demonstration (45 mins)\n5. Q&A and Synthesis (15 mins)");
      setGeneratingPlan(false);
    }, 1500);
  }

  function generateStudyGuide() {
    setGeneratingGuide(true);
    setTimeout(() => {
      handleUpdateActiveModule('studyGuide', "Module Overview:\nThis module introduces the core concepts required to understand the topic. Students should focus on the underlying mathematical principles before applying them to software.\n\nKey Concepts to Master:\n- Definition and scope of the analytical model.\n- Primary algorithms and their use-cases.\n- Common pitfalls in data preparation.\n\nReading Assignment:\n- Textbook Chapters 3 & 4.\n- Provided PDF: 'Industry Applications of Analytics'.");
      setGeneratingGuide(false);
    }, 2000);
  }

  const cardStyles = { borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 8px 32px rgba(0,0,0,0.04)', backgroundColor: '#FFFFFF' };
  const inputStyles = { '& .MuiOutlinedInput-root': { borderRadius: '16px', backgroundColor: '#F8FAFC' } };

  function getStatusColor(status) {
    if (status === 'Ready') return { bg: '#DCFCE7', color: '#166534' };
    if (status === 'Drafting') return { bg: '#FEF9C3', color: '#854D0E' };
    return { bg: '#F1F5F9', color: '#64748B' };
  }

  // ==========================================
  // GATEKEEPER: IF NO SYLLABUS, SHOW LOCK
  // ==========================================
  if (!syllabusReady) {
    return (
      <FacultyLayout>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh', textAlign: 'center' }}>
          <Box sx={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
            <LockIcon sx={{ fontSize: 40, color: '#94A3B8' }} />
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#0F172A', mb: 1 }}>Module Builder Locked</Typography>
          <Typography sx={{ color: '#64748B', mb: 4, maxWidth: 400 }}>You must set up your course syllabus before you can start building modules and learning materials.</Typography>
          <Button variant="contained" onClick={() => navigate(ROUTES.FACULTY.SYLLABUS)} sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' }, borderRadius: '12px', px: 4, py: 1.5, fontWeight: 700, textTransform: 'none' }}>
            Go to Syllabus Setup
          </Button>
        </Box>
      </FacultyLayout>
    )
  }

  // ==========================================
  // VIEW 2: MODULE BUILDER WORKSPACE (Editing a specific module)
  // ==========================================
  if (activeModule) {
    return (
      <FacultyLayout>
        <Box sx={{ mb: 3, pt: 1 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => setActiveModuleId(null)} sx={{ color: '#64748B', mb: 2, textTransform: 'none', fontWeight: 600, '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' } }}>
            Back to Modules
          </Button>
          <Typography sx={{ color: '#8B0000', fontWeight: 700, fontSize: '0.9rem', mb: 0.5 }}>{activeModule.week}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#0F172A', mb: 1 }}>{activeModule.title}</Typography>
        </Box>

        {saveSuccess && <Alert severity="success" sx={{ mb: 3, borderRadius: '12px' }}>{saveSuccess}</Alert>}

        <Stack spacing={4} className="animate-fade-in">
          
          {/* Section 1: Lesson Plan */}
          <Card sx={cardStyles}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '12px', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SchoolIcon sx={{ color: '#0F172A' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A' }}>Lesson Plan & Structure</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.85rem' }}>Define the flow of the class session.</Typography>
                  </Box>
                </Box>
                <Button 
                  variant="contained" 
                  startIcon={generatingPlan ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />} 
                  onClick={generateLessonPlan}
                  disabled={generatingPlan}
                  sx={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                >
                  {generatingPlan ? 'Generating...' : 'Generate Plan'}
                </Button>
              </Box>
              <TextField 
                value={activeModule.lessonPlan} 
                onChange={(e) => handleUpdateActiveModule('lessonPlan', e.target.value)} 
                multiline rows={6} fullWidth sx={inputStyles} 
                placeholder="1. Introduction (15 mins)...\n2. Core Concepts..." 
              />
            </CardContent>
          </Card>

          {/* Section 2: Study Guide */}
          <Card sx={cardStyles}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '12px', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MenuBookIcon sx={{ color: '#0F172A' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A' }}>Study Guide & Materials</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.85rem' }}>Content, readings, and notes for the students.</Typography>
                  </Box>
                </Box>
                <Button 
                  variant="contained" 
                  startIcon={generatingGuide ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />} 
                  onClick={generateStudyGuide}
                  disabled={generatingGuide}
                  sx={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                >
                  {generatingGuide ? 'Generating...' : 'Generate Guide'}
                </Button>
              </Box>
              <TextField 
                value={activeModule.studyGuide} 
                onChange={(e) => handleUpdateActiveModule('studyGuide', e.target.value)} 
                multiline rows={8} fullWidth sx={inputStyles} 
                placeholder="Module Overview:\nKey Concepts:\nReadings:" 
              />
            </CardContent>
          </Card>

          {/* Action Bar */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2, pb: 4 }}>
            <Button onClick={() => setActiveModuleId(null)} sx={{ color: '#64748B', fontWeight: 700, textTransform: 'none' }}>Cancel</Button>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={() => handleSaveModule(false)} sx={{ borderRadius: '12px', textTransform: 'none', px: 4, py: 1.2, fontWeight: 700, borderColor: '#CBD5E1', color: '#0F172A' }}>
                Save Draft
              </Button>
              <Button variant="contained" onClick={() => handleSaveModule(true)} sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' }, borderRadius: '12px', textTransform: 'none', px: 4, py: 1.2, fontWeight: 700 }}>
                Publish Module
              </Button>
            </Box>
          </Box>

        </Stack>
      </FacultyLayout>
    )
  }

  // ==========================================
  // VIEW 1: MODULE GRID (List of all modules from syllabus)
  // ==========================================
  return (
    <FacultyLayout>
      <Box sx={{ mb: 4, pt: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
          Course Modules
        </Typography>
        <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
          These modules were automatically derived from your Syllabus Schedule. Click to build their content.
        </Typography>
      </Box>

      {saveSuccess && <Alert severity="success" sx={{ mb: 3, borderRadius: '12px' }}>{saveSuccess}</Alert>}

      <Grid container spacing={3}>
        {moduleList.map((module) => {
          const statusColors = getStatusColor(module.status);
          
          return (
            <Grid item xs={12} md={6} key={module.id}>
              <Card 
                onClick={() => setActiveModuleId(module.id)}
                sx={{ 
                  ...cardStyles, 
                  cursor: 'pointer',
                  minHeight: 180,
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease', 
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 12px 48px rgba(0,0,0,0.08)' } 
                }}
              >
                <CardContent sx={{ p: 4, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Chip 
                      label={module.week} 
                      size="small" 
                      sx={{ backgroundColor: '#F1F5F9', color: '#475569', fontWeight: 700, borderRadius: '8px' }} 
                    />
                    <Chip 
                      icon={module.status === 'Ready' ? <CheckCircleIcon style={{ color: statusColors.color }} /> : undefined}
                      label={module.status} 
                      size="small" 
                      sx={{ backgroundColor: statusColors.bg, color: statusColors.color, fontWeight: 700, borderRadius: '8px' }} 
                    />
                  </Box>
                  
                  <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#0F172A', mb: 2, lineHeight: 1.3 }}>
                    {module.title}
                  </Typography>

                  <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', color: '#8B0000', fontWeight: 700, fontSize: '0.9rem' }}>
                    <ViewModuleIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                    {module.status === 'Ready' ? 'Edit Module Content' : 'Build Module Content'} →
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )
        })}
      </Grid>
    </FacultyLayout>
  )
}