import { describe, it, expect } from 'vitest';
import { migrateData } from '../storage';

describe('migrateData', () => {
  it('handles completely empty input', () => {
    const result = migrateData({});
    expect(Array.isArray(result.subjects)).toBe(true);
    expect(Array.isArray(result.schedule)).toBe(true);
    expect(Array.isArray(result.questionBanks)).toBe(true);
    expect(Array.isArray(result.studyTechniques)).toBe(true);
    expect(result.userProgress).toBeDefined();
    expect(result.lastModified).toBeDefined();
  });

  it('adds missing fields to topics with defaults', () => {
    const raw = {
      subjects: [{
        id: 's1', name: 'Test', topics: [{
          id: 't1', number: 1, name: 'Topic 1', status: 'green',
          grades: [5], avgGrade: 5, quizCount: 1, lastReview: null
        }],
        semester: '1'
      }]
    };
    const result = migrateData(raw);
    const topic = result.subjects[0].topics[0];

    expect(topic.readCount).toBe(0);
    expect(topic.lastRead).toBeNull();
    expect(topic.size).toBeNull();
    expect(topic.wrongAnswers).toEqual([]);
    expect(topic.highlights).toEqual([]);
    expect(topic.customQuestions).toEqual([]);
    expect(topic.material).toBe('');
    expect(topic.materialImages).toEqual([]);
  });

  it('adds weight 1.0 to quizHistory entries missing it', () => {
    const raw = {
      subjects: [{
        id: 's1', name: 'Test', topics: [{
          id: 't1', number: 1, name: 'Topic 1', status: 'green',
          grades: [5], avgGrade: 5, quizCount: 1, lastReview: null,
          quizHistory: [{ date: '2025-01-01', score: 80, bloomLevel: 1, questionsCount: 5, correctAnswers: 4 }]
        }],
        semester: '1'
      }]
    };
    const result = migrateData(raw);
    expect(result.subjects[0].topics[0].quizHistory[0].weight).toBe(1.0);
  });

  it('preserves existing customQuestions', () => {
    const raw = {
      subjects: [{
        id: 's1', name: 'Test', topics: [{
          id: 't1', number: 1, name: 'Topic 1', status: 'green',
          grades: [], avgGrade: null, quizCount: 0, lastReview: null,
          customQuestions: [{ question: 'What is X?', answer: 'Y' }]
        }],
        semester: '1'
      }]
    };
    const result = migrateData(raw);
    expect(result.subjects[0].topics[0].customQuestions).toEqual([{ question: 'What is X?', answer: 'Y' }]);
  });

  it('handles corrupted customQuestions (non-array) gracefully', () => {
    const raw = {
      subjects: [{
        id: 's1', name: 'Test', topics: [{
          id: 't1', number: 1, name: 'Topic 1', status: 'green',
          grades: [], avgGrade: null, quizCount: 0, lastReview: null,
          customQuestions: 'corrupted'
        }],
        semester: '1'
      }]
    };
    const result = migrateData(raw);
    expect(result.subjects[0].topics[0].customQuestions).toEqual([]);
  });

  it('pre-seeds study techniques when empty', () => {
    const result = migrateData({ studyTechniques: [] });
    expect(result.studyTechniques.length).toBeGreaterThan(0);
    expect(result.studyTechniques[0].isBuiltIn).toBe(true);
  });

  it('sanitizes technique with invalid category', () => {
    const raw = {
      studyTechniques: [{
        id: 't1', name: 'Test', slug: 'test',
        category: 'INVALID_CATEGORY',
        description: '', howToApply: '', icon: '📝',
        isActive: false, isBuiltIn: false, practiceCount: 0, notes: ''
      }]
    };
    const result = migrateData(raw);
    expect(result.studyTechniques[0].category).toBe('encoding');
  });

  it('adds default studyGoals fields', () => {
    const result = migrateData({});
    expect(result.studyGoals).toBeDefined();
    expect(result.studyGoals.vacationMode).toBe(false);
    expect(typeof result.studyGoals.monthlyMinutes).toBe('number');
  });

  it('sets subjectType default to preclinical', () => {
    const raw = {
      subjects: [{
        id: 's1', name: 'Test', topics: [], semester: '1'
      }]
    };
    const result = migrateData(raw);
    expect(result.subjects[0].subjectType).toBe('preclinical');
  });
});
