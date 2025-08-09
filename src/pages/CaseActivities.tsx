import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useCases } from "@/context/CasesContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Clock, User, Tag, Calendar as CalendarIcon } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

interface Activity {
  id: string;
  title: string;
  description: string;
  type: string;
  assignedTo: string;
  dueDate: string;
  status: string;
  createdAt: string;
  createdBy: string;
  documents?: ActivityDocument[];
  notes?: string;
  voiceTranscription?: string;
}

interface ActivityDocument {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
}

export default function CaseActivities() {
  const { caseId } = useParams();
  const { cases } = useCases();
  const caseItem = cases.find((c) => c.id === caseId);
  const { data: profile } = useProfile();
  
  const [activities, setActivities] = useState<Activity[]>([
    {
      id: "ACT-001",
      title: "Initial Client Meeting",
      description: "Meet with client to discuss case details and gather initial documentation",
      type: "Meeting",
      assignedTo: "Sarah Wilson",
      dueDate: "2024-02-05",
      status: "Completed",
      createdAt: "2024-01-20",
      createdBy: "Sarah Wilson",
    },
    {
      id: "ACT-002",
      title: "Document Review",
      description: "Review all contract documents and identify key issues",
      type: "Research",
      assignedTo: "Michael Chen",
      dueDate: "2024-02-10",
      status: "In Progress",
      createdAt: "2024-01-22",
      createdBy: "Sarah Wilson",
    },
    {
      id: "ACT-003",
      title: "Court Filing",
      description: "Prepare and file initial motion with the court",
      type: "Court",
      assignedTo: "Sarah Wilson",
      dueDate: "2024-02-15",
      status: "Pending",
      createdAt: "2024-01-25",
      createdBy: "Sarah Wilson",
    },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newActivity, setNewActivity] = useState({
    title: "",
    description: "",
    type: "",
    assignedTo: "",
    dueDate: "",
  });

  const activityTypes = [
    "Meeting",
    "Court",
    "Settlement",
    "Research",
    "Documentation",
    "Communication",
    "Filing",
    "Discovery",
    "Negotiation",
    "Other"
  ];

  const statusColors = {
    "Completed": "bg-green-100 text-green-800 border-green-200",
    "In Progress": "bg-blue-100 text-blue-800 border-blue-200",
    "Pending": "bg-yellow-100 text-yellow-800 border-yellow-200",
    "Cancelled": "bg-red-100 text-red-800 border-red-200"
  };

  const typeColors = {
    "Meeting": "bg-purple-100 text-purple-800 border-purple-200",
    "Court": "bg-red-100 text-red-800 border-red-200",
    "Settlement": "bg-green-100 text-green-800 border-green-200",
    "Research": "bg-blue-100 text-blue-800 border-blue-200",
    "Documentation": "bg-orange-100 text-orange-800 border-orange-200",
    "Communication": "bg-cyan-100 text-cyan-800 border-cyan-200",
    "Filing": "bg-indigo-100 text-indigo-800 border-indigo-200",
    "Discovery": "bg-pink-100 text-pink-800 border-pink-200",
    "Negotiation": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "Other": "bg-gray-100 text-gray-800 border-gray-200"
  };

  if (!caseItem) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Case not found.</p>
      </div>
    );
  }

  const handleCreateActivity = () => {
    const activity: Activity = {
      id: `ACT-${String(activities.length + 1).padStart(3, '0')}`,
      ...newActivity,
      status: "Pending",
      createdAt: new Date().toISOString().split('T')[0],
      createdBy: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Unknown User" : "Unknown User",
    };
    
    setActivities([...activities, activity]);
    setNewActivity({
      title: "",
      description: "",
      type: "",
      assignedTo: "",
      dueDate: "",
    });
    setIsDialogOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" asChild>
            <Link to={`/cases/${caseId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Case
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Case Activities</h1>
            <p className="text-muted-foreground">{caseItem.name}</p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Activity</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Activity title"
                  value={newActivity.title}
                  onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Activity description"
                  value={newActivity.description}
                  onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newActivity.type} onValueChange={(value) => setNewActivity({ ...newActivity, type: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select activity type" />
                  </SelectTrigger>
                  <SelectContent>
                    {activityTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="assignedTo">Assigned To</Label>
                <Input
                  id="assignedTo"
                  placeholder="Assignee name"
                  value={newActivity.assignedTo}
                  onChange={(e) => setNewActivity({ ...newActivity, assignedTo: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={newActivity.dueDate}
                  onChange={(e) => setNewActivity({ ...newActivity, dueDate: e.target.value })}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateActivity}>
                  Create Activity
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {activities.map((activity) => (
          <Card key={activity.id} className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{activity.title}</h3>
                    <Badge 
                      variant="outline" 
                      className={typeColors[activity.type as keyof typeof typeColors]}
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {activity.type}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className={statusColors[activity.status as keyof typeof statusColors]}
                    >
                      {activity.status}
                    </Badge>
                  </div>
                  
                  <p className="text-muted-foreground">{activity.description}</p>
                  
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      Assigned to: {activity.assignedTo}
                    </div>
                    <div className="flex items-center gap-1">
                      <CalendarIcon className="h-4 w-4" />
                      Due: {activity.dueDate}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Created: {activity.createdAt}
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                  <Button variant="outline" size="sm">
                    Complete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activities.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Activities Yet</h3>
            <p className="text-muted-foreground mb-4">
              Start by creating your first activity for this case.
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Activity
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}