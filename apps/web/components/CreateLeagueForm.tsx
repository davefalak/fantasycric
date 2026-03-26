// Frontend League Creation Form Component
'use client';

import React, { useState } from 'react';
import { authFetch } from '@/lib/auth';

interface CreateLeagueFormProps {
  onLeagueCreated?: (leagueId: string, inviteCode: string) => void;
  isLoading?: boolean;
}

interface FormData {
  name: string;
  description: string;
  memberLimit: number;
  totalBudget: number;
  joinDeadline: string;
}

export function CreateLeagueForm({ onLeagueCreated, isLoading = false }: CreateLeagueFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    memberLimit: 4,
    totalBudget: 100,
    joinDeadline: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'memberLimit' || name === 'totalBudget' ? parseInt(value) : value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'League name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'League name must be 100 characters or less';
    }

    if (formData.memberLimit < 2 || formData.memberLimit > 100) {
      newErrors.memberLimit = 'Member limit must be between 2 and 100';
    }

    if (formData.totalBudget < 50 || formData.totalBudget > 1000) {
      newErrors.totalBudget = 'Budget must be between 50 and 1000 points';
    }

    if (!formData.joinDeadline) {
      newErrors.joinDeadline = 'Join deadline is required';
    } else {
      const deadline = new Date(formData.joinDeadline);
      if (isNaN(deadline.getTime())) {
        newErrors.joinDeadline = 'Invalid date format';
      } else if (deadline <= new Date()) {
        newErrors.joinDeadline = 'Deadline must be in the future';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setSuccessMessage('');

    try {
      const response = await authFetch('/api/leagues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.status === 401) {
        setErrors({ submit: 'Please login to create a league.' });
        return;
      }

      if (result.success && result.data) {
        setSuccessMessage(`League "${result.data.name}" created successfully! Invite code: ${result.data.inviteCode}`);
        if (onLeagueCreated) {
          onLeagueCreated(result.data.id, result.data.inviteCode);
        }
        // Reset form
        setFormData({
          name: '',
          description: '',
          memberLimit: 4,
          totalBudget: 100,
          joinDeadline: ''
        });
      } else {
        setErrors({ submit: result.error || 'Failed to create league' });
      }
    } catch (error) {
      setErrors({ submit: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setSubmitting(false);
    }
  };

  // Get minimum date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="league-form-container">
      <h2>Create a New League</h2>
      
      <form onSubmit={handleSubmit} className="league-form">
        {/* League Name */}
        <div className="form-group">
          <label htmlFor="name">League Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Diwali Derby 2026"
            maxLength={100}
            disabled={submitting || isLoading}
          />
          {errors.name && <span className="error">{errors.name}</span>}
          <small>{formData.name.length}/100</small>
        </div>

        {/* Description */}
        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Optional league description"
            rows={3}
            disabled={submitting || isLoading}
          />
          {errors.description && <span className="error">{errors.description}</span>}
        </div>

        {/* Member Limit */}
        <div className="form-group">
          <label htmlFor="memberLimit">Number of Players *</label>
          <select
            id="memberLimit"
            name="memberLimit"
            value={formData.memberLimit}
            onChange={handleChange}
            disabled={submitting || isLoading}
          >
            {[2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map(num => (
              <option key={num} value={num}>
                {num} players
              </option>
            ))}
          </select>
          {errors.memberLimit && <span className="error">{errors.memberLimit}</span>}
          <small>Choose how many players can join this league</small>
        </div>

        {/* Total Budget */}
        <div className="form-group">
          <label htmlFor="totalBudget">Budget per Team (Points) *</label>
          <input
            type="number"
            id="totalBudget"
            name="totalBudget"
            value={formData.totalBudget}
            onChange={handleChange}
            min="50"
            max="1000"
            step="5"
            disabled={submitting || isLoading}
          />
          {errors.totalBudget && <span className="error">{errors.totalBudget}</span>}
          <small>Total points each player gets to build their team (50-1000)</small>
        </div>

        {/* Join Deadline */}
        <div className="form-group">
          <label htmlFor="joinDeadline">Team Join Deadline *</label>
          <input
            type="datetime-local"
            id="joinDeadline"
            name="joinDeadline"
            value={formData.joinDeadline}
            onChange={handleChange}
            min={minDate}
            disabled={submitting || isLoading}
          />
          {errors.joinDeadline && <span className="error">{errors.joinDeadline}</span>}
          <small>Players must create their teams by this date</small>
        </div>

        {/* Submit Error */}
        {errors.submit && (
          <div className="error-message">
            {errors.submit}
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="success-message">
            {successMessage}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || isLoading}
          className="btn-primary"
        >
          {submitting || isLoading ? 'Creating League...' : 'Create League'}
        </button>
      </form>

      <style jsx>{`
        .league-form-container {
          max-width: 500px;
          margin: 0 auto;
          padding: 2rem;
          background: #f7f4ea;
          border-radius: 8px;
        }

        .league-form-container h2 {
          margin-top: 0;
          color: #132a13;
        }

        .form-group {
          margin-bottom: 1.5rem;
          display: flex;
          flex-direction: column;
        }

        .form-group label {
          margin-bottom: 0.5rem;
          font-weight: bold;
          color: #132a13;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          font-family: inherit;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: #ff6b35;
          box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
        }

        .form-group input:disabled,
        .form-group textarea:disabled,
        .form-group select:disabled {
          background-color: #f0f0f0;
          cursor: not-allowed;
        }

        .form-group small {
          margin-top: 0.3rem;
          color: #666;
          font-size: 0.85rem;
        }

        .error {
          color: #cb2431;
          font-size: 0.85rem;
          margin-top: 0.3rem;
        }

        .error-message {
          background-color: #fff5f5;
          border: 1px solid #cb2431;
          color: #cb2431;
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        .success-message {
          background-color: #f0fff4;
          border: 1px solid #22863a;
          color: #22863a;
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        .btn-primary {
          background-color: #ff6b35;
          color: white;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          font-weight: bold;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
