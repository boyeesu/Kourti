import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Building, Users, FileText, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";
import logo from "@/assets/kouti-legal-logo.png";

const steps = [
  {
    id: 1,
    title: "Organization Setup",
    description: "Tell us about your organization",
    icon: Building,
  },
  {
    id: 2,
    title: "Team Configuration",
    description: "Set up your team structure",
    icon: Users,
  },
  {
    id: 3,
    title: "Practice Areas",
    description: "Configure your practice areas",
    icon: FileText,
  },
  {
    id: 4,
    title: "Welcome!",
    description: "You're all set to get started",
    icon: CheckCircle,
  },
];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    organization: {
      name: "",
      type: "",
      size: "",
      description: "",
    },
    team: {
      inviteEmails: [""],
      defaultRoles: [],
    },
    practiceAreas: [],
  });

  const practiceAreaOptions = [
    "Corporate Law",
    "Litigation",
    "Real Estate",
    "Employment Law",
    "Intellectual Property",
    "Family Law",
    "Criminal Law",
    "Tax Law",
    "Immigration Law",
    "Environmental Law",
  ];

  const progress = (currentStep / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = () => {
    // TODO: Submit onboarding data when backend is ready
    console.log("Onboarding completed:", formData);
    // Navigate to dashboard
  };

  const addEmailField = () => {
    setFormData({
      ...formData,
      team: {
        ...formData.team,
        inviteEmails: [...formData.team.inviteEmails, ""],
      },
    });
  };

  const updateEmail = (index: number, email: string) => {
    const newEmails = [...formData.team.inviteEmails];
    newEmails[index] = email;
    setFormData({
      ...formData,
      team: {
        ...formData.team,
        inviteEmails: newEmails,
      },
    });
  };

  const togglePracticeArea = (area: string) => {
    const newAreas = formData.practiceAreas.includes(area)
      ? formData.practiceAreas.filter(a => a !== area)
      : [...formData.practiceAreas, area];
    setFormData({ ...formData, practiceAreas: newAreas });
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="Enter your organization name"
                value={formData.organization.name}
                onChange={(e) => setFormData({
                  ...formData,
                  organization: { ...formData.organization, name: e.target.value }
                })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Organization Type</Label>
              <Select 
                value={formData.organization.type}
                onValueChange={(value) => setFormData({
                  ...formData,
                  organization: { ...formData.organization, type: value }
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="law-firm">Law Firm</SelectItem>
                  <SelectItem value="corporate-legal">Corporate Legal Department</SelectItem>
                  <SelectItem value="government">Government Agency</SelectItem>
                  <SelectItem value="nonprofit">Nonprofit Organization</SelectItem>
                  <SelectItem value="solo">Solo Practice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Organization Size</Label>
              <Select 
                value={formData.organization.size}
                onValueChange={(value) => setFormData({
                  ...formData,
                  organization: { ...formData.organization, size: value }
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-5">1-5 employees</SelectItem>
                  <SelectItem value="6-20">6-20 employees</SelectItem>
                  <SelectItem value="21-50">21-50 employees</SelectItem>
                  <SelectItem value="51-200">51-200 employees</SelectItem>
                  <SelectItem value="200+">200+ employees</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="orgDescription">Description (Optional)</Label>
              <Textarea
                id="orgDescription"
                placeholder="Brief description of your organization"
                value={formData.organization.description}
                onChange={(e) => setFormData({
                  ...formData,
                  organization: { ...formData.organization, description: e.target.value }
                })}
              />
            </div>
          </div>
        );
        
      case 2:
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">Invite Team Members</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Add email addresses to invite your team members
              </p>
              
              <div className="space-y-3">
                {formData.team.inviteEmails.map((email, index) => (
                  <Input
                    key={index}
                    type="email"
                    placeholder="colleague@example.com"
                    value={email}
                    onChange={(e) => updateEmail(index, e.target.value)}
                  />
                ))}
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={addEmailField}
                  className="w-full"
                >
                  Add Another Email
                </Button>
              </div>
            </div>
          </div>
        );
        
      case 3:
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">Practice Areas</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Select the practice areas relevant to your organization
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                {practiceAreaOptions.map((area) => (
                  <div key={area} className="flex items-center space-x-2">
                    <Checkbox
                      id={area}
                      checked={formData.practiceAreas.includes(area)}
                      onCheckedChange={() => togglePracticeArea(area)}
                    />
                    <Label htmlFor={area} className="text-sm font-normal">
                      {area}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
        
      case 4:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold">Welcome to Kouti Legal!</h3>
              <p className="text-muted-foreground mt-2">
                Your organization has been set up successfully. You can now start managing your cases, documents, and team.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium">Quick Start Tips:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Create your first case in the Cases section</li>
                <li>• Upload important documents to get organized</li>
                <li>• Set up your calendar for important deadlines</li>
                <li>• Invite team members to collaborate</li>
              </ul>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-card">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="Kouti Legal" className="h-12 w-12" />
          </div>
          <Progress value={progress} className="w-full mb-6" />
          <div className="flex justify-center space-x-4 mb-6">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center space-y-2 ${
                    step.id === currentStep
                      ? "text-primary"
                      : step.id < currentStep
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      step.id === currentStep
                        ? "bg-primary text-primary-foreground"
                        : step.id < currentStep
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-center">
                    <div className="font-medium">{step.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <CardTitle>{steps[currentStep - 1]?.title}</CardTitle>
          <p className="text-muted-foreground">
            {steps[currentStep - 1]?.description}
          </p>
        </CardHeader>
        
        <CardContent>
          {renderStepContent()}
          
          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
            
            {currentStep === steps.length ? (
              <Button onClick={handleFinish}>
                Get Started
                <CheckCircle className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}