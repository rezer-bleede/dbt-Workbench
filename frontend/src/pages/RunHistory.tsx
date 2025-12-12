import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Run } from '@/types';

const RunHistory: React.FC = () => {
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    const fetchRuns = async () => {
      const response = await api.get<Run[]>('/runs');
      setRuns(response.data);
    };
    fetchRuns();
  }, []);

  return (
    <div>
      <h1>Run History</h1>
      <table>
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Command</th>
            <th>Status</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(run => (
            <tr key={run.id}>
              <td>{run.run_id}</td>
              <td>{run.command}</td>
              <td>{run.status}</td>
              <td>{new Date(run.timestamp).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RunHistory;
