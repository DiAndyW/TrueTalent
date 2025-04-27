import React, { useState, useEffect } from 'react';
import './ProblemSidebar.css';
import ProblemSearch from './ProblemSearch';

const ProblemSidebar = ({ problems, role, selectedQuestion, pickQuestion }) => {
  const [availableProblems, setAvailableProblems] = useState([]);

  // Sync local state when problems prop changes
  useEffect(() => {
    if (problems && Array.isArray(problems)) {
      setAvailableProblems(problems);
    }
  }, [problems]);

  const handlePickQuestion = (problem) => {
    console.log("ProblemSidebar handling pick:", problem);
    pickQuestion(problem);
  };

  const handleClearSelection = () => {
    console.log("Clearing selected problem");
    pickQuestion(null);
  };

  return (
    <div className="problem-sidebar">
      <div className="problem-header">
        <h3>LeetCode Problems</h3>
      </div>

      {selectedQuestion ? (
        <div className="selected-problem">
          <h4>{selectedQuestion.title}</h4>
          {/* You can add more problem details here */}
          {role === 'interviewer' && (
            <button 
              className="clear-problem-btn" 
              onClick={handleClearSelection}
            >
              Choose Another Problem
            </button>
          )}
        </div>
      ) : (
        <>
          {role === 'interviewer' ? (
            // Only show ProblemSearch for interviewers
            <ProblemSearch 
              problems={availableProblems} 
              pickQuestion={handlePickQuestion} 
            />
          ) : (
            // Show waiting message for interviewees
            <div className="waiting-message">
              <p>Waiting for interviewer to pick a problem...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProblemSidebar;