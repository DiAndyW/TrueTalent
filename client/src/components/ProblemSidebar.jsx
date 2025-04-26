import React, { useState, useEffect } from 'react';
import './ProblemSidebar.css';

const ProblemSidebar = ({ problems, role, selectedQuestion, pickQuestion }) => {
  const [availableProblems, setAvailableProblems] = useState([]);

  // Sync local state when problems prop changes
  useEffect(() => {
    setAvailableProblems(problems);
  }, [problems]);

  return (
    <div className="problem-sidebar">
      <div className="problem-header">
        <h3>LeetCode Problems</h3>
      </div>

      <div className="problem-list">
        {selectedQuestion ? (
          <div className="selected-problem">
            <h4>{selectedQuestion.title}</h4>
            {/* You can add more problem details here */}
          </div>
        ) : (
          <>
            {role === 'interviewer' ? (
              availableProblems.length === 0 ? (
                <div className="empty-chat">
                  <p>No problems available</p>
                </div>
              ) : (
                availableProblems.map((problem, index) => (
                  <div
                    key={index}
                    className="problem-item"
                    onClick={() => pickQuestion(problem)}
                    style={{ cursor: 'pointer' }}
                  >
                    {problem.title}
                  </div>
                ))
              )
            ) : (
              <div className="waiting-message">
                <p>Waiting for interviewer to pick a problem...</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProblemSidebar;

// // components/ProblemSidebar.jsx
// import React, { useState, useEffect } from 'react';
// import './ProblemSidebar.css';

// const ProblemSidebar = ({ problems, role, selectedQuestion, pickQuestion }) => {
//   const [availableProblems, setAvailableProblems] = useState([]);

//   // Sync local state when problems prop changes
//   useEffect(() => {
//     setAvailableProblems(problems);
//   }, [problems]);

//   return (
//     <div className="problem-sidebar">
//       <div className="problem-header">
//         <h3>LeetCode Problems</h3>
//       </div>

//       <div className="problem-list">
//         {selectedQuestion ? (
//           <div className="selected-problem">
//             <h4>{selectedQuestion.title}</h4>
//           </div>
//         ) : (
//           <>
//             {role === 'interviewer' ? (
//               availableProblems.length === 0 ? (
//                 <div className="empty-chat">
//                   <p>No problems available</p>
//                 </div>
//               ) : (
//                 availableProblems.map((problem, index) => (
//                   <div
//                     key={index}
//                     className="problem-item"
//                     onClick={() => pickQuestion(problem)}
//                     style={{ cursor: 'pointer' }}
//                   >
//                     {problem.title}
//                   </div>
//                 ))
//               )
//             ) : (
//               <div className="waiting-message">
//                 <p>Waiting for interviewer to pick a problem...</p>
//               </div>
//             )}
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// export default ProblemSidebar;


// import React from 'react';
// import './ProblemSidebar.css';

// const ProblemSidebar = ({ problems, role, selectedQuestion, pickQuestion }) => {
//   return (
//     <div className="problem-sidebar">
//       <div className="problem-header">
//         <h3>LeetCode Problems</h3>
//       </div>

//       <div className="problem-list">
//         {selectedQuestion ? (
//           // Show the selected question for both roles once it's picked
//           <div className="selected-problem">
//             <h4>{selectedQuestion.title}</h4>
//           </div>
//         ) : (
//           // No question selected yet
//           <>
//             {role === 'interviewer' ? (
//               problems.length === 0 ? (
//                 <div className="empty-chat">
//                   <p>No problems available</p>
//                 </div>
//               ) : (
//                 problems.map((problem, index) => (
//                   <div 
//                     key={index} 
//                     className="problem-item" 
//                     onClick={() => pickQuestion(problem)}
//                     style={{ cursor: 'pointer' }}
//                   >
//                     {problem.title}
//                   </div>
//                 ))
//               )
//             ) : (
//               <div className="waiting-message">
//                 <p>Waiting for interviewer to pick a problem...</p>
//               </div>
//             )}
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// export default ProblemSidebar;



