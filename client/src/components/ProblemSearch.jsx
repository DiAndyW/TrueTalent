// client/src/components/ProblemSearch.js
import { useState, useEffect } from 'react';
import './ProblemSearch.css'; // Create this file for styling

function ProblemSearch({ problems, pickQuestion }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    // Initialize results with the problems list
    setResults(problems || []);
  }, [problems]);

  const handleSearch = (event) => {
    setQuery(event.target.value);
    
    // Filter problems based on the search query
    if (problems && problems.length > 0) {
      const filteredResults = problems.filter((problem) =>
        problem.title.toLowerCase().includes(event.target.value.toLowerCase())
      );
      setResults(filteredResults);
    }
  };

  const handleProblemSelect = (problem) => {
    console.log("Problem selected:", problem);
    pickQuestion(problem);
  };

  return (
    <div className="problem-search">
      <input
        type="text"
        placeholder="Search for a problem..."
        value={query}
        onChange={handleSearch}
      />
      <div className="search-results">
        {results && results.map((problem, index) => (
          <div
            key={index}
            className="search-result-item"
            onClick={() => handleProblemSelect(problem)}
          >
            {problem.title}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProblemSearch;