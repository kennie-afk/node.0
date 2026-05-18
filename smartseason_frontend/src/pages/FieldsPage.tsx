import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { Field } from '../types';
import { useAuth } from '../features/auth/AuthContext';
import { useState } from 'react';

const FieldsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedField, setSelectedField] = useState<Field | null>(null);

  const { data: fieldsData } = useQuery({
    queryKey: ['fields'],
    queryFn: async () => {
      const res = await apiClient.get(user?.role === 'ADMIN' ? '/fields' : '/fields/my-fields');
      return res.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, stage, notes }: { id: number; stage: string; notes: string }) => {
      const res = await apiClient.put(`/fields/${id}/update`, { stage, notes });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fields'] });
      setSelectedField(null);
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold mb-8">Fields Management</h1>

      <div className="grid grid-cols-1 gap-6">
        {fieldsData?.map((field: Field) => (
          <div key={field.id} className="card p-6 flex justify-between items-center">
            <div>
              <h3 className="font-medium">{field.name}</h3>
              <p className="text-sm text-zinc-500">{field.cropType} • Planted {field.plantingDate}</p>
              <p className="text-sm mt-1">
                Stage: <span className="font-medium">{field.currentStage}</span>
              </p>
            </div>

            <div className="flex items-center gap-4">
              <span className={`px-4 py-1 text-xs font-medium rounded-2xl ${
                field.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                field.status === 'AT_RISK' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-700'
              }`}>
                {field.status}
              </span>
              <button
                onClick={() => setSelectedField(field)}
                className="px-5 py-2 bg-black text-white text-sm rounded-2xl hover:bg-zinc-800"
              >
                Update Stage
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-6">Update {selectedField.name}</h2>
            <select
              onChange={(e) => updateMutation.mutate({ id: selectedField.id, stage: e.target.value, notes: '' })}
              className="w-full p-4 border border-zinc-300 rounded-2xl mb-6"
            >
              <option value="PLANTED">Planted</option>
              <option value="GROWING">Growing</option>
              <option value="READY">Ready</option>
              <option value="HARVESTED">Harvested</option>
            </select>
            <button
              onClick={() => setSelectedField(null)}
              className="w-full py-4 text-zinc-500 hover:bg-zinc-100 rounded-2xl"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldsPage;