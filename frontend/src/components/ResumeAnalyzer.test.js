import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import ResumeAnalyzer from './ResumeAnalyzer';

jest.mock('axios');

describe('ResumeAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders title and form elements', () => {
    render(<ResumeAnalyzer />);
    expect(screen.getByText(/AI Resume & Job Match Analyzer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Job Posting URL/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze Match/i })).toBeInTheDocument();
  });

  test('shows error when job URL is empty on submit', async () => {
    render(<ResumeAnalyzer />);
    fireEvent.click(screen.getByRole('button', { name: /Analyze Match/i }));
    expect(await screen.findByText(/Please enter a job URL/i)).toBeInTheDocument();
  });

  test('shows error when resume is missing', async () => {
    render(<ResumeAnalyzer />);
    await userEvent.type(screen.getByLabelText(/Job Posting URL/i), 'https://example.com/job');
    fireEvent.click(screen.getByRole('button', { name: /Analyze Match/i }));
    expect(await screen.findByText(/Please upload your resume/i)).toBeInTheDocument();
  });

  test('displays analysis results on success', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        match_score: 82,
        missing_skills: ['Kubernetes', 'Terraform'],
        suggestions: ['Highlight DevOps work', 'Add cloud certs'],
      },
    });

    render(<ResumeAnalyzer />);

    await userEvent.type(screen.getByLabelText(/Job Posting URL/i), 'https://example.com/job');

    const file = new File(['resume content'], 'resume.txt', { type: 'text/plain' });
    const input = document.getElementById('resume-upload');
    await userEvent.upload(input, file);

    fireEvent.click(screen.getByRole('button', { name: /Analyze Match/i }));

    expect(await screen.findByText('82')).toBeInTheDocument();
    expect(await screen.findByText('Kubernetes')).toBeInTheDocument();
    expect(await screen.findByText('Highlight DevOps work')).toBeInTheDocument();
  });

  test('displays error message on API failure', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { detail: 'Failed to fetch job URL: Connection refused' } },
    });

    render(<ResumeAnalyzer />);
    await userEvent.type(screen.getByLabelText(/Job Posting URL/i), 'https://bad.example.com/job');

    const file = new File(['resume content'], 'resume.txt', { type: 'text/plain' });
    const input = document.getElementById('resume-upload');
    await userEvent.upload(input, file);

    fireEvent.click(screen.getByRole('button', { name: /Analyze Match/i }));

    expect(await screen.findByText(/Failed to fetch job URL/i)).toBeInTheDocument();
  });

  test('shows file name after upload', async () => {
    render(<ResumeAnalyzer />);
    const file = new File(['data'], 'my_resume.txt', { type: 'text/plain' });
    const input = document.getElementById('resume-upload');
    await userEvent.upload(input, file);
    expect(screen.getByText('my_resume.txt')).toBeInTheDocument();
  });
});
