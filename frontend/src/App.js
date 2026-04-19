import React from 'react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import ResumeAnalyzer from './components/ResumeAnalyzer';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
    background: { default: '#f0f2f5' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ResumeAnalyzer />
    </ThemeProvider>
  );
}

export default App;
