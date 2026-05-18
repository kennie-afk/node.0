import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { useAuth } from '../features/auth/AuthContext';
import type { Field } from '../types';

const DashboardPage = () => {
  const { user } = useAuth();

  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard');
      return res.data.data;
    },
  });

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-zinc-500">Welcome back, {user?.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <p className="text-sm text-zinc-500">Total Fields</p>
          <p className="text-5xl font-semibold mt-2">{dashboard?.totalFields || 0}</p>
        </div>

        <div className="card p-6">
          <p className="text-sm text-zinc-500">Active</p>
          <p className="text-5xl font-semibold mt-2 text-emerald-600">
            {dashboard?.statusBreakdown?.ACTIVE || 0}
          </p>
        </div>

        <div className="card p-6">
          <p className="text-sm text-zinc-500">At Risk</p>
          <p className="text-5xl font-semibold mt-2 text-amber-600">
            {dashboard?.statusBreakdown?.['AT_RISK'] || 0}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-xl font-medium mb-4">Recent Fields</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboard?.fields?.slice(0, 6).map((field: Field) => (
            <div key={field.id} className="card p-6">
              <div className="flex justify-between">
                <h3 className="font-medium">{field.name}</h3>
                <span className={`px-3 py-1 text-xs rounded-full ${
                  field.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                  field.status === 'AT_RISK' ? 'bg-amber-100 text-amber-700' :
                  'bg-zinc-100 text-zinc-700'
                }`}>
                  {field.status}
                </span>
              </div>
              <p className="text-sm text-zinc-500 mt-1">{field.cropType}</p>
              <p className="text-xs text-zinc-400 mt-4">
                Stage: {field.currentStage}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;