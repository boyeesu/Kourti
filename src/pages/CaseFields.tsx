import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCaseFields } from '@/features/cases/api/useCaseFields';
import { useCreateCaseField } from '@/features/cases/api/useCreateCaseField';
import { useUpdateCaseField } from '@/features/cases/api/useUpdateCaseField';
import { useDeleteCaseField } from '@/features/cases/api/useDeleteCaseField';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CaseFields() {
  const { caseTypeId } = useParams<{ caseTypeId: string }>();
  const { data: fields = [], isLoading } = useCaseFields(caseTypeId!);
  const createField = useCreateCaseField();
  const updateField = useUpdateCaseField();
  const deleteField = useDeleteCaseField(caseTypeId!);

  const [newLabel, setNewLabel] = useState('');
  const [newDataType, setNewDataType] = useState<'text'|'number'|'date'|'select'|'boolean'>('text');

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    createField.mutate({
      case_type_id: caseTypeId!,
      label: newLabel,
      field_key: newLabel.toLowerCase().replace(/\s+/g, '_'),
      data_type: newDataType,
      required: false,
      options: newDataType === 'select' ? { choices: [] } : undefined,
      field_order: fields.length,
    });
    setNewLabel('');
  };

  if (isLoading) return <div>Loading fields...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Manage Fields for Case Type</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add Field</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Label</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Field label" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newDataType} onValueChange={(v) => setNewDataType(v as any)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleAdd}>Add Field</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.label}</TableCell>
                  <TableCell>{f.field_key}</TableCell>
                  <TableCell>{f.data_type}</TableCell>
                  <TableCell>{f.required ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => deleteField.mutate(f.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}