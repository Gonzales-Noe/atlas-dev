import { useNavigate } from 'react-router-dom'
import { Box, Button, Container, Typography, Grid, Card, CardContent, AppBar, Toolbar, Stack } from '@mui/material'
import { useAuth } from '../store/authStore'
import atlasLogo from '../assets/atlas-logo.webp'

export default function LandingPage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()

  const handleGetStarted = () => {
    if (isAuthenticated) {
      // Redirect based on role
      if (user?.role === 'superadmin') navigate('/superadmin/dashboard')
      else if (user?.role === 'admin') navigate('/admin/dashboard')
      else navigate('/faculty/dashboard')
    } else {
      navigate('/signup')
    }
  }

  const handleSignIn = () => {
    navigate('/signin')
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAFA' }}>
      {/* Navigation Bar */}
      <AppBar position="static" sx={{ background: '#FFF', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <Toolbar>
          <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 32, objectFit: 'contain' }} />
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={2}>
            <Button
              color="inherit"
              sx={{ textDecoration: 'none', color: '#333', fontWeight: 500 }}
              href="#home"
            >
              HOME
            </Button>
            <Button
              color="inherit"
              sx={{ textDecoration: 'none', color: '#333', fontWeight: 500 }}
              href="#pricing"
            >
              PRICING
            </Button>
            <Button
              color="inherit"
              sx={{ textDecoration: 'none', color: '#333', fontWeight: 500 }}
              href="#contact"
            >
              CONTACT
            </Button>
            {isAuthenticated ? (
              <Button
                variant="contained"
                onClick={handleGetStarted}
                sx={{ background: '#15803D', '&:hover': { background: '#14532D' } }}
              >
                Dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  onClick={handleSignIn}
                  sx={{ borderColor: '#15803D', color: '#15803D' }}
                >
                  SIGN IN
                </Button>
                <Button
                  variant="contained"
                  onClick={() => navigate('/signup')}
                  sx={{ background: '#15803D', '&:hover': { background: '#14532D' } }}
                >
                  SIGN UP
                </Button>
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Hero Section */}
      <Box id="home" sx={{ py: 8, textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontWeight: 700, mb: 2, color: '#1A1A1A' }}>
            Welcome to ATLAS
          </Typography>
          <Typography variant="h5" sx={{ color: '#666', mb: 4 }}>
            Comprehensive Learning Assessment & Tracking System for Higher Education
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={handleGetStarted}
            sx={{
              background: '#15803D',
              px: 4,
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 600,
              '&:hover': { background: '#14532D' },
            }}
          >
            Get Started
          </Button>
        </Container>
      </Box>

      {/* Features Section */}
      <Box sx={{ py: 8, bgcolor: '#FFF' }}>
        <Container maxWidth="lg">
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 6, textAlign: 'center', color: '#1A1A1A' }}>
            Understand Your Class
          </Typography>
          <Typography
            sx={{
              textAlign: 'center',
              color: '#666',
              mb: 6,
              maxWidth: 600,
              mx: 'auto',
              lineHeight: 1.6,
            }}
          >
            Connect your Google Sheets gradebook. ATLAS computes weighted scores, identifies which learning outcomes
            your class is struggling with, and tells you exactly what to do next.
          </Typography>

          <Grid container spacing={4} sx={{ mb: 8 }}>
            {[
              {
                icon: '🎓',
                title: 'Set Up Your Course',
                desc: 'Input your course title, program outcomes, credit units, and intended students. ATLAS ingests and configures everything it needs to build around your specific course.',
              },
              {
                icon: '📋',
                title: 'Generate Your Syllabus & Modules',
                desc: 'In minutes, ATLAS produces a complete week-by-week, CHED OBE-compliant structure — all grounded in your course materials, not generic templates.',
              },
              {
                icon: '✅',
                title: 'Build Your Assessments',
                desc: 'Generate ILO-mapped exams in multiple formats. Every item is tagged by Bloom\'s Taxonomy level and comes with automated answer key or essay rubric.',
              },
            ].map((feature, idx) => (
              <Grid item xs={12} md={4} key={idx}>
                <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', textAlign: 'center' }}>
                  <CardContent>
                    <Typography sx={{ fontSize: '3rem', mb: 2 }}>{feature.icon}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                      {feature.title}
                    </Typography>
                    <Typography sx={{ color: '#666', fontSize: '0.95rem', lineHeight: 1.6 }}>
                      {feature.desc}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Typography variant="h5" sx={{ fontWeight: 700, mb: 4, textAlign: 'center', color: '#1A1A1A' }}>
            Understand Your Class
          </Typography>
          <Typography
            sx={{
              textAlign: 'center',
              color: '#666',
              mb: 6,
              maxWidth: 600,
              mx: 'auto',
              lineHeight: 1.6,
            }}
          >
            Connect your Google Sheets gradebook. ATLAS computes weighted scores, identifies which learning outcomes
            your class is struggling with, and tells you exactly what to do next.
          </Typography>
        </Container>
      </Box>

      {/* Testimonials Section */}
      <Box sx={{ py: 8, bgcolor: '#FAFAFA' }}>
        <Container maxWidth="lg">
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 6, textAlign: 'center', color: '#1A1A1A' }}>
            What Educators Are Saying
          </Typography>
          <Grid container spacing={3}>
            {[
              {
                quote: 'I used to spend entire weekends preparing for one course. With ATLAS, I had a complete, properly aligned syllabus ready in under 20 minutes. That time went back to my students.',
                author: 'Faculty Member',
                role: 'College of Education',
              },
              {
                quote: 'The prescriptive dashboard showed me exactly which topics my class was failing on — by learning outcome, not just by score. I\'ve never had that kind of clarity from any tool before.',
                author: 'Instructor',
                role: 'College of Arts and Sciences',
              },
              {
                quote: 'Our department adopted ATLAS mid-semester. Provisioning our faculty was straightforward, and they were generating exams and syllabi on the same day. The onboarding friction was genuinely minimal.',
                author: 'College Head',
                role: 'College of Information',
              },
            ].map((testimonial, idx) => (
              <Grid item xs={12} md={4} key={idx}>
                <Card
                  sx={{
                    boxShadow: 'none',
                    bgcolor: '#15803D',
                    color: '#FFF',
                    textAlign: 'center',
                    p: 3,
                  }}
                >
                  <CardContent>
                    <Typography sx={{ mb: 2, fontSize: '1.3rem' }}>★★★★★</Typography>
                    <Typography sx={{ mb: 3, lineHeight: 1.6, fontStyle: 'italic' }}>
                      "{testimonial.quote}"
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>{testimonial.author}</Typography>
                    <Typography sx={{ fontSize: '0.85rem', opacity: 0.9 }}>{testimonial.role}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Team Section */}
      <Box sx={{ py: 8, bgcolor: '#FFF' }}>
        <Container maxWidth="lg">
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 6, textAlign: 'center', color: '#1A1A1A' }}>
            The People Behind ATLAS
          </Typography>
          <Typography sx={{ textAlign: 'center', color: '#666', mb: 6, fontSize: '0.95rem' }}>
            Built by Students. Made for Teachers.
          </Typography>

          <Grid container spacing={4} sx={{ mb: 6 }}>
            {[
              { name: 'Hearty Isabel Delacion', title: 'CEO' },
              { name: 'Jasmin B. Esperida', title: 'CEO' },
              { name: 'Noe L. Gonzales', title: 'CEO' },
            ].map((member, idx) => (
              <Grid item xs={12} md={4} key={idx}>
                <Card
                  sx={{
                    boxShadow: 'none',
                    border: '1px solid #EEE',
                    textAlign: 'center',
                    p: 3,
                    minHeight: 150,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <Typography sx={{ fontWeight: 700, mb: 1 }}>{member.name}</Typography>
                  <Typography sx={{ color: '#15803D', fontSize: '0.9rem' }}>{member.title}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => navigate('/signup')}
              sx={{
                background: '#15803D',
                px: 4,
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 600,
                '&:hover': { background: '#14532D' },
              }}
            >
              Sign Up
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ py: 4, bgcolor: '#1A1A1A', color: '#FFF', textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.9rem' }}>
          © 2026 ATLAS. All rights reserved. | Privacy Policy | Terms and Conditions
        </Typography>
      </Box>
    </Box>
  )
}
