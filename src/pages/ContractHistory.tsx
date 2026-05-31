import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { contractsData } from '@/pages/contractsData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Clock,
  User,
  FileText,
  Download,
  Eye,
  GitBranch,
  Calendar,
  Filter,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer } from '@/components/layout/PageContainer';

interface Version {
  version: number;
  date: string;
  description: string;
  editedBy?: string;
  changes?: string[];
  fileSize?: string;
  status?: string;
}

export default function ContractHistory() {
  const { id } = useParams();
  const contract = contractsData.find((c) => c.id === id);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');

  // Enhanced version data with more details
  const enhancedVersions: Version[] = [
    {
      version: 3,
      date: '2024-02-01',
      description: 'Final signed contract with updated payment terms',
      editedBy: 'Sarah Wilson',
      changes: [
        'Updated payment terms from 30 to 45 days',
        'Added early termination clause',
        'Modified intellectual property section',
      ],
      fileSize: '156 KB',
      status: 'Final',
    },
    {
      version: 2,
      date: '2024-01-15',
      description: 'Second draft with client feedback incorporated',
      editedBy: 'Michael Chen',
      changes: [
        'Revised liability clauses',
        'Updated service level agreements',
        'Added compliance requirements',
      ],
      fileSize: '142 KB',
      status: 'Draft',
    },
    {
      version: 1,
      date: '2023-12-01',
      description: 'Initial contract draft',
      editedBy: 'Sarah Wilson',
      changes: [
        'Created initial contract structure',
        'Added standard terms and conditions',
        'Included basic party information',
      ],
      fileSize: '128 KB',
      status: 'Draft',
    },
  ];

  if (!contract) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Contract Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The contract you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild>
              <Link to="/contracts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Contracts
              </Link>
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const filteredVersions = enhancedVersions.filter((version) => {
    const matchesSearch =
      version.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      version.editedBy?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterBy === 'all' || version.status?.toLowerCase() === filterBy;

    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'final':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'review':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleDownloadVersion = (version: Version) => {
    // Simulate downloading a specific version
    const content = `Contract Version ${version.version}\n\nGenerated on: ${version.date}\nEdited by: ${version.editedBy}\n\n${contract.content}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${contract.name}_v${version.version}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreVersion = (version: Version) => {
    contract.content = `Restored to version ${version.version} on ${version.date}\n\n${contract.content}`;
    alert(`Restored to version ${version.version} (simulated)`);
  };

  return (
    <PageContainer>
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/contracts/${contract.id}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-muted-foreground" />
              Version History
            </h1>
            <p className="text-muted-foreground">{contract.name}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/contracts/${contract.id}/edit`}>Edit Current Version</Link>
          </Button>
          <Button asChild>
            <Link to={`/contracts/${contract.id}`}>
              <Eye className="h-4 w-4 mr-2" />
              View Contract
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search versions by description or editor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={filterBy} onValueChange={setFilterBy}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Versions</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="review">Under Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Version Timeline */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Contract Versions ({filteredVersions.length})
            <Badge variant="secondary">
              Current: v{Math.max(...enhancedVersions.map((v) => v.version))}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredVersions.map((version, index) => (
              <div key={version.version} className="relative">
                {index < filteredVersions.length - 1 && (
                  <div className="absolute left-6 top-12 bottom-0 w-px bg-border"></div>
                )}
                <div className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-primary">v{version.version}</span>
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{version.description}</h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(version.date), 'MMM dd, yyyy')}
                          </div>
                          {version.editedBy && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {version.editedBy}
                            </div>
                          )}
                          {version.fileSize && (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {version.fileSize}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {version.status && (
                          <Badge variant="outline" className={getStatusColor(version.status)}>
                            {version.status}
                          </Badge>
                        )}
                        <div className="flex gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Version {version.version} Details</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <strong>Date:</strong> {format(new Date(version.date), 'PPP')}
                                  </div>
                                  <div>
                                    <strong>Edited by:</strong> {version.editedBy}
                                  </div>
                                  <div>
                                    <strong>Status:</strong> {version.status}
                                  </div>
                                  <div>
                                    <strong>File Size:</strong> {version.fileSize}
                                  </div>
                                </div>

                                <div>
                                  <strong className="text-sm">Description:</strong>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {version.description}
                                  </p>
                                </div>

                                {version.changes && version.changes.length > 0 && (
                                  <div>
                                    <strong className="text-sm">Changes in this version:</strong>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground mt-1 space-y-1">
                                      {version.changes.map((change, i) => (
                                        <li key={i}>{change}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                <div className="flex justify-end gap-2 pt-4">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownloadVersion(version)}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </Button>
                                  <Button size="sm" onClick={() => handleRestoreVersion(version)}>
                                    Restore Version
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadVersion(version)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {version.changes && version.changes.length > 0 && (
                      <div className="text-sm">
                        <p className="text-muted-foreground mb-1">Key changes:</p>
                        <ul className="text-muted-foreground space-y-1">
                          {version.changes.slice(0, 2).map((change, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                              {change}
                            </li>
                          ))}
                          {version.changes.length > 2 && (
                            <li className="text-xs text-muted-foreground/70">
                              +{version.changes.length - 2} more changes
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredVersions.length === 0 && (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Versions Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || filterBy !== 'all'
                  ? 'No versions match your current filters.'
                  : "This contract doesn't have any version history yet."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Version Comparison */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Version Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Compare From</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {enhancedVersions.map((version) => (
                    <SelectItem key={version.version} value={version.version.toString()}>
                      v{version.version} - {version.date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Compare To</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {enhancedVersions.map((version) => (
                    <SelectItem key={version.version} value={version.version.toString()}>
                      v{version.version} - {version.date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Button variant="outline" className="w-full">
              <GitBranch className="h-4 w-4 mr-2" />
              Compare Versions
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
