import React, { createContext, useContext, useState } from 'react';

export interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedBy: string;
  uploadDate: string;
  linkedCase: string;
  status: string;
}

export interface Case {
  id: string;
  name: string;
  client: string;
  status: string;
  stage: string;
  priority: string;
  assignedTo: string;
  startDate: string;
  dueDate: string;
  documents: Document[];
}

interface CasesContextValue {
  cases: Case[];
  statuses: string[];
  updateCaseStatus: (id: string, status: string) => void;
  addStatus: (status: string) => void;
}

const CasesContext = createContext<CasesContextValue | undefined>(undefined);

const initialDocuments: Document[] = [
  {
    id: 'DOC-001',
    name: 'Smith_Contract_Amendment_v2.pdf',
    type: 'PDF',
    size: '2.4 MB',
    uploadedBy: 'Sarah Wilson',
    uploadDate: '2024-01-28',
    linkedCase: 'CASE-001',
    status: 'Under Review',
  },
  {
    id: 'DOC-002',
    name: 'Corporate_Merger_Analysis.docx',
    type: 'DOCX',
    size: '1.8 MB',
    uploadedBy: 'Michael Chen',
    uploadDate: '2024-01-27',
    linkedCase: 'CASE-002',
    status: 'Approved',
  },
  {
    id: 'DOC-003',
    name: 'Employment_Agreement_Template.pdf',
    type: 'PDF',
    size: '892 KB',
    uploadedBy: 'Jessica Thompson',
    uploadDate: '2024-01-26',
    linkedCase: 'CASE-003',
    status: 'Draft',
  },
  {
    id: 'DOC-004',
    name: 'Patent_Application_Draft.pdf',
    type: 'PDF',
    size: '5.2 MB',
    uploadedBy: 'David Rodriguez',
    uploadDate: '2024-01-25',
    linkedCase: 'CASE-004',
    status: 'Final',
  },
  {
    id: 'DOC-005',
    name: 'Property_Deed_Review.pdf',
    type: 'PDF',
    size: '3.1 MB',
    uploadedBy: 'Sarah Wilson',
    uploadDate: '2024-01-24',
    linkedCase: 'CASE-005',
    status: 'Under Review',
  },
];

const initialCases: Case[] = [
  {
    id: 'CASE-001',
    name: 'Smith vs. Johnson Contract Dispute',
    client: 'Acme Corporation',
    status: 'Active',
    stage: 'Investigation',
    priority: 'High',
    assignedTo: 'Sarah Wilson',
    startDate: '2024-01-15',
    dueDate: '2024-02-15',
    documents: initialDocuments.filter((d) => d.linkedCase === 'CASE-001'),
  },
  {
    id: 'CASE-002',
    name: 'Corporate Merger Review',
    client: 'Tech Solutions Inc',
    status: 'Review',
    stage: 'Assessment',
    priority: 'Medium',
    assignedTo: 'Michael Chen',
    startDate: '2024-01-20',
    dueDate: '2024-02-20',
    documents: initialDocuments.filter((d) => d.linkedCase === 'CASE-002'),
  },
  {
    id: 'CASE-003',
    name: 'Employment Agreement Analysis',
    client: 'StartupXYZ',
    status: 'Draft',
    stage: 'Drafting',
    priority: 'Low',
    assignedTo: 'Jessica Thompson',
    startDate: '2024-01-10',
    dueDate: '2024-02-28',
    documents: initialDocuments.filter((d) => d.linkedCase === 'CASE-003'),
  },
  {
    id: 'CASE-004',
    name: 'Intellectual Property Dispute',
    client: 'Innovation Labs',
    status: 'Closed',
    stage: 'Litigation',
    priority: 'High',
    assignedTo: 'David Rodriguez',
    startDate: '2023-12-01',
    dueDate: '2024-01-30',
    documents: initialDocuments.filter((d) => d.linkedCase === 'CASE-004'),
  },
  {
    id: 'CASE-005',
    name: 'Real Estate Transaction Review',
    client: 'Property Group Ltd',
    status: 'Active',
    stage: 'Closing',
    priority: 'Medium',
    assignedTo: 'Sarah Wilson',
    startDate: '2024-01-22',
    dueDate: '2024-03-01',
    documents: initialDocuments.filter((d) => d.linkedCase === 'CASE-005'),
  },
];

export const CasesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cases, setCases] = useState<Case[]>(initialCases);
  const [statuses, setStatuses] = useState<string[]>(['Active', 'Review', 'Draft', 'Closed']);

  const updateCaseStatus = (id: string, status: string) => {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
  };

  const addStatus = (status: string) => {
    setStatuses((prev) => (prev.includes(status) ? prev : [...prev, status]));
  };

  return (
    <CasesContext.Provider value={{ cases, statuses, updateCaseStatus, addStatus }}>
      {children}
    </CasesContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useCases() {
  const ctx = useContext(CasesContext);
  if (!ctx) {
    throw new Error('useCases must be used within CasesProvider');
  }
  return ctx;
}
