import React, { useState } from 'react';
import { useCaseTypes } from '@/features/cases/api/useCaseTypes';
import { useCreateCaseType } from '@/features/cases/api/useCreateCaseType';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export default function CaseTypes() {
  const { data: caseTypes = [], isLoading, error } = useCaseTypes();
  const createMutation = useCreateCaseType();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({ name, description });
    setName('');
    setDescription('');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Case Types</h1>
      </div>

      {createMutation.isError && (
        <div className="text-red-600">Error creating case type: {createMutation.error.message}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create New Case Type</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="caseTypeName">Name</Label>
              <Input
                id="caseTypeName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Litigation"
                required
              />
            </div>
            <div>
              <Label htmlFor="caseTypeDescription">Description</Label>
              <Input
                id="caseTypeDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Something about this type"
              />
            </div>
            <Button type="submit" disabled={createMutation.isLoading}>
              {createMutation.isLoading ? 'Creating...' : 'Create'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Case Types</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading case types...</div>
          ) : error ? (
            <div className="text-red-600">Error loading: {error.message}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caseTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell>{type.name}</TableCell>
                    <TableCell>{type.description}</TableCell>
                    <TableCell>{new Date(type.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}