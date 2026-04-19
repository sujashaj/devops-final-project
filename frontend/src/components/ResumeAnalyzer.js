import React, { useState } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Alert,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import LinkIcon from '@mui/icons-material/Link';
import NotesIcon from '@mui/icons-material/Notes';

const API_BASE = process.env.REACT_APP_API_URL || '';

function ScoreGauge({ score }) {
  const color = score >= 75 ? '#4caf50' : score >= 50 ? '#ff9800' : '#f44336';
  const label = score >= 75 ? 'Strong Match' : score >= 50 ? 'Moderate Match' : 'Weak Match';

  return (
    <Box sx={{ textAlign: 'center', py: 3 }}>
      <Box sx={{ position: 'relative', display: 'inline-flex', mb: 1 }}>
        <CircularProgress
          variant="determinate"
          value={score}
          size={140}
          thickness={6}
          sx={{ color }}
        />
        <Box
          sx={{
            top: 0, left: 0, bottom: 0, right: 0,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <Typography variant="h3" fontWeight="bold" sx={{ color }}>
            {score}
          </Typography>
          <Typography variant="caption" color="text.secondary">/ 100</Typography>
        </Box>
      </Box>
      <Typography variant="h6" sx={{ color, fontWeight: 600 }}>{label}</Typography>
      <LinearProgress
        variant="determinate"
        value={score}
        sx={{
          mt: 1, height: 8, borderRadius: 4,
          '& .MuiLinearProgress-bar': { backgroundColor: color },
          backgroundColor: '#e0e0e0',
        }}
      />
    </Box>
  );
}

export default function ResumeAnalyzer() {
  const [inputMode, setInputMode] = useState('url');
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({ url: null, text: null });
  const [error, setError] = useState('');

  const result = results[inputMode];

  const handleFileChange = (e) => {
    setResumeFile(e.target.files[0] || null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (inputMode === 'url' && !jobUrl.trim()) { setError('Please enter a job URL.'); return; }
    if (inputMode === 'text' && !jobText.trim()) { setError('Please paste the job description.'); return; }
    if (!resumeFile) { setError('Please upload your resume.'); return; }

    setResults(prev => ({ ...prev, [inputMode]: null }));
    const formData = new FormData();
    if (inputMode === 'url') {
      formData.append('job_url', jobUrl.trim());
    } else {
      formData.append('job_text', jobText.trim());
    }
    formData.append('resume', resumeFile);

    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResults(prev => ({ ...prev, [inputMode]: data }));
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 5 }}>
        <WorkOutlineIcon sx={{ fontSize: 52, color: 'primary.main', mb: 1 }} />
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          AI Resume & Job Match Analyzer
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Paste a job URL or job description text, upload your resume — get an instant AI-powered
          match score, missing skills, and improvement suggestions.
        </Typography>
      </Box>

      {/* Input form */}
      <Card elevation={3} sx={{ borderRadius: 3, mb: 4 }}>
        <CardContent sx={{ p: 4 }}>

          {/* Toggle — outside the form so buttons don't trigger submit */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <ToggleButtonGroup
              value={inputMode}
              exclusive
              onChange={(_, val) => { if (val) setInputMode(val); }}
              disabled={loading}
              size="small"
            >
              <ToggleButton value="url" sx={{ px: 3, gap: 1 }}>
                <LinkIcon fontSize="small" /> Job URL
              </ToggleButton>
              <ToggleButton value="text" sx={{ px: 3, gap: 1 }}>
                <NotesIcon fontSize="small" /> Paste Text
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box component="form" onSubmit={handleSubmit} noValidate>

            {inputMode === 'url' ? (
              <TextField
                label="Job Posting URL"
                placeholder="https://careers.example.com/job/12345"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                fullWidth
                required
                variant="outlined"
                sx={{ mb: 3 }}
                disabled={loading}
              />
            ) : (
              <TextField
                label="Job Description"
                placeholder="Paste the full job description here..."
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                fullWidth
                required
                multiline
                rows={8}
                variant="outlined"
                sx={{ mb: 3 }}
                disabled={loading}
              />
            )}

            <Box
              sx={{
                border: '2px dashed',
                borderColor: resumeFile ? 'primary.main' : 'grey.400',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                mb: 3,
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: 'primary.main' },
              }}
              onClick={() => document.getElementById('resume-upload').click()}
            >
              <input
                id="resume-upload"
                type="file"
                accept=".txt,.pdf,.doc,.docx"
                style={{ display: 'none' }}
                onChange={handleFileChange}
                disabled={loading}
              />
              <CloudUploadIcon sx={{ fontSize: 40, color: resumeFile ? 'primary.main' : 'grey.500', mb: 1 }} />
              <Typography variant="body1" color={resumeFile ? 'primary.main' : 'text.secondary'}>
                {resumeFile ? resumeFile.name : 'Click to upload resume (.txt, .pdf, .doc, .docx)'}
              </Typography>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={loading}
              sx={{ py: 1.5, fontWeight: 'bold', borderRadius: 2 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Analyze Match'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Box>
          {/* Score card */}
          <Card elevation={3} sx={{ borderRadius: 3, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom align="center">
                Match Score
              </Typography>
              <ScoreGauge score={result.match_score} />
            </CardContent>
          </Card>

          {/* Missing skills */}
          {result.missing_skills?.length > 0 && (
            <Card elevation={3} sx={{ borderRadius: 3, mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                  Missing Skills
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {result.missing_skills.map((skill, i) => (
                    <Chip
                      key={i}
                      label={skill}
                      color="error"
                      variant="outlined"
                      size="medium"
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Suggestions */}
          {result.suggestions?.length > 0 && (
            <Card elevation={3} sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                  Improvement Suggestions
                </Typography>
                <Divider sx={{ mb: 1 }} />
                <List dense>
                  {result.suggestions.map((suggestion, i) => (
                    <ListItem key={i} alignItems="flex-start">
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <LightbulbOutlinedIcon color="warning" />
                      </ListItemIcon>
                      <ListItemText primary={suggestion} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}
        </Box>
      )}
    </Container>
  );
}
