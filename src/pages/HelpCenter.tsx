import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  HelpCircle,
  Search,
  FileText,
  MessageCircle,
  Book,
  ExternalLink,
  Send,
  Mail,
  History,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [supportForm, setSupportForm] = React.useState({
    name: '',
    email: '',
    subject: '',
    category: '',
    message: '',
  });
  const navigate = useNavigate();

  const faqs = [
    {
      question: 'How do I create a new matter?',
      answer:
        "You can create a new matter by navigating to the 'Matters' page and clicking on the 'New Matter' button in the top-right corner. Fill in the required details in the form and click 'Create Matter'.",
    },
    {
      question: 'How do I upload documents to a matter?',
      answer:
        "Navigate to the matter details page by clicking on a matter from the Matters list. Then, click on the 'Documents' tab and use the 'Upload Document' button to add files to the matter.",
    },
    {
      question: 'Can I share documents with clients?',
      answer:
        "Yes, you can share documents with clients by navigating to the document, clicking the 'Share' button, and entering the client's email address. They will receive a secure link to access the document.",
    },
    {
      question: 'How do I generate a contract?',
      answer:
        "Go to the 'Contracts' page, click 'New Contract', and select a template. Fill in the required fields and click 'Generate'. You can then preview, edit, and finalize the contract.",
    },
    {
      question: 'How does the AI assistant work?',
      answer:
        "The Ream AI assistant can help with legal research, document analysis, and contract review. Navigate to the 'Ream AI' page, type your question or upload a document, and the AI will provide relevant information and insights.",
    },
  ];

  const guides = [
    {
      title: 'Getting Started with Kourti AI',
      description: 'Learn the basics of navigating and using Kourti AI platform',
      content: `# Getting Started with Kourti AI

## Welcome to Kourti AI

Kourti AI is a comprehensive legal practice management platform designed to streamline your legal operations with AI-powered tools and intuitive workflows.

## First Steps

### 1. Dashboard Overview
- Your dashboard provides a quick overview of your practice
- View key metrics, recent activities, and upcoming deadlines
- Access quick actions for common tasks

### 2. Navigation
- Use the sidebar to navigate between different modules
- Main sections include: Dashboard, Matters, Clients, Calendar, Documents, Contracts
- Workspace tools: Ream AI, Voice Recorder, Transcriptions, Invoicing

### 3. User Profile
- Click on your profile icon to access settings
- Update your personal information and preferences
- Configure notifications and security settings

## Key Features Overview

- **Matters Management**: Organize and track all your legal cases
- **Client Management**: Maintain comprehensive client records
- **Document Management**: Store, organize, and analyze legal documents
- **Contract Management**: Create, review, and manage contracts with AI assistance
- **Calendar & Tasks**: Schedule events and manage deadlines
- **Ream AI**: Get AI-powered assistance for research, analysis, and document review
- **Voice Recorder**: Record and transcribe meetings, interviews, and notes

## Next Steps

1. Complete your profile setup
2. Create your first matter or case
3. Add clients to your system
4. Upload and organize documents
5. Explore Ream AI for document analysis`,
    },
    {
      title: 'Matters Management Guide',
      description: 'Complete guide to creating, managing, and tracking legal matters',
      content: `# Matters Management Guide

## Overview

Matters (also called Cases) are the central organizing unit in Kourti AI. Each matter represents a legal case, project, or engagement.

## Creating a New Matter

1. Navigate to the **Matters** page from the sidebar
2. Click the **"New Matter"** button in the top-right corner
3. Fill in the required information:
   - **Title**: A descriptive name for the matter
   - **Case Type**: Select from predefined types (Litigation, IP, Corporate, etc.)
   - **Client**: Associate with an existing client or create a new one
   - **Status**: Set initial status (Open, In Progress, Closed, etc.)
   - **Priority**: Assign priority level (Low, Medium, High, Urgent)
   - **Description**: Add detailed notes about the matter
4. Click **"Create Matter"** to save

## Managing Matters

### Viewing Matters
- Use the list view to see all matters
- Filter by status, priority, case type, or assigned user
- Search by matter title or client name
- Sort by date, priority, or status

### Matter Details
Click on any matter to view:
- **Overview**: Basic information and status
- **Documents**: All documents associated with the matter
- **Activities**: Timeline of activities and updates
- **Tasks**: Assigned tasks and deadlines
- **Notes**: Internal notes and observations

### Editing Matters
1. Open the matter details page
2. Click **"Edit"** button
3. Update any fields as needed
4. Save changes

### Matter Activities
Track all important events:
- Document uploads
- Status changes
- Task completions
- Notes and comments
- Client communications

## Best Practices

- Use consistent naming conventions for matters
- Assign appropriate priorities to manage workload
- Keep matter descriptions up-to-date
- Regularly update matter status
- Link all related documents to the matter
- Use activities to maintain a complete audit trail`,
    },
    {
      title: 'Client Management Guide',
      description: 'How to manage client information, contacts, and relationships',
      content: `# Client Management Guide

## Overview

The Clients module helps you maintain comprehensive records of all your clients, their contact information, and interaction history.

## Adding a New Client

1. Go to the **Clients** page
2. Click **"New Client"** button
3. Enter client information:
   - **Name**: Client or company name
   - **Email**: Primary contact email
   - **Phone**: Contact phone number
   - **Address**: Physical or mailing address
   - **Type**: Individual, Company, or Organization
   - **Notes**: Additional information or special instructions
4. Click **"Create Client"** to save

## Managing Clients

### Client List
- View all clients in a searchable, filterable list
- Filter by client type or status
- Search by name, email, or company
- Sort by name, date added, or number of matters

### Client Details Page
Access comprehensive client information:
- **Profile**: Contact details and basic information
- **Matters**: All matters associated with this client
- **Documents**: Shared documents and communications
- **Communication Log**: History of all interactions
- **Notes**: Internal notes and observations

### Editing Client Information
1. Open the client details page
2. Click **"Edit"** button
3. Update any fields
4. Save changes

## Client Communication

### Adding Communication Logs
1. Open the client details page
2. Navigate to the **Communication** tab
3. Click **"Add Communication"**
4. Record:
   - Date and time
   - Communication type (Email, Phone, Meeting, etc.)
   - Subject or summary
   - Notes or transcript
5. Save the log entry

## Best Practices

- Keep client contact information current
- Regularly update communication logs
- Link all related matters to the client
- Use notes to track important client preferences
- Maintain confidentiality of client information`,
    },
    {
      title: 'Document Management Guide',
      description: 'Upload, organize, and analyze documents with AI-powered tools',
      content: `# Document Management Guide

## Overview

The Documents module allows you to store, organize, and analyze all your legal documents with powerful AI-assisted features.

## Uploading Documents

### Single Document Upload
1. Navigate to **Documents** page
2. Click **"Upload Document"** button
3. Select file from your computer
4. Fill in document details:
   - **Title**: Document name
   - **Type**: Document category (Contract, Brief, Letter, etc.)
   - **Matter**: Link to associated matter (optional)
   - **Client**: Associate with client (optional)
   - **Tags**: Add tags for easy searching
5. Click **"Upload"**

### Bulk Upload
- Use the bulk upload feature to add multiple documents at once
- Documents will be processed and organized automatically

## Document Organization

### Filtering and Search
- **Filter by Type**: Show only specific document types
- **Filter by Matter**: View documents for a specific matter
- **Filter by Client**: See all documents for a client
- **Search**: Use the search bar to find documents by title or content
- **Tags**: Filter by tags for quick access

### Document Details
Click on any document to:
- View the full document
- See document metadata
- Access AI analysis features
- Download or export
- Share with team members or clients

## AI-Powered Document Analysis

### Document Summarization
1. Open a document
2. Click **"AI Summarize"** button
3. Get an AI-generated summary of key points, clauses, and important information

### Clause Extraction
1. Select a document
2. Click **"Extract Clauses"**
3. Review extracted clauses organized by category

### Document Comparison
1. Navigate to **Contracts** > **Compare**
2. Select two documents to compare
3. View side-by-side comparison with:
   - Highlighted differences
   - Similarity scores
   - AI commentary on changes

## Document Export

### Export Options
- **PDF Export**: Export documents as PDF files
- **Word Export**: Export as DOCX format
- **Bulk Export**: Export multiple documents at once

## Best Practices

- Use consistent naming conventions
- Add tags for easy retrieval
- Link documents to matters and clients
- Regularly review and organize documents
- Use AI features to quickly understand document content
- Keep document metadata up-to-date`,
    },
    {
      title: 'Contract Management Guide',
      description: 'Create, review, and manage contracts with AI assistance',
      content: `# Contract Management Guide

## Overview

The Contracts module provides comprehensive contract lifecycle management with AI-powered generation, review, and analysis.

## Creating Contracts

### AI-Powered Contract Generation
1. Go to **Contracts** page
2. Click **"New Contract"** button
3. Select **"Generate with AI"**
4. Provide:
   - Contract type (Employment, NDA, Service Agreement, etc.)
   - Key terms and requirements
   - Parties involved
   - Special clauses or conditions
5. Review and edit the AI-generated contract
6. Save and finalize

### Upload Existing Contract
1. Click **"Upload Contract"**
2. Select contract file (PDF, DOCX)
3. Fill in contract details
4. System will extract key information automatically

## Contract Review

### AI Contract Review
1. Open a contract
2. Click **"AI Review"** button
3. Get comprehensive analysis:
   - Risk assessment
   - Missing clauses
   - Unusual terms
   - Compliance issues
   - Recommendations

### Contract Comparison
1. Navigate to **Compare Contracts**
2. Select two contracts to compare
3. View:
   - Side-by-side comparison
   - Clause-level differences
   - Similarity analysis
   - AI commentary on changes

### Redline Review
1. Open contract for review
2. Enable **"Redline Mode"**
3. Make edits and track changes
4. Generate redlined version with tracked changes

## Contract Version Control

### Viewing History
- Access **Contract History** to see all versions
- Compare any two versions
- View change summaries
- Restore previous versions if needed

### Version Management
- Each edit creates a new version
- All versions are preserved
- Track who made changes and when
- Add notes to versions

## Contract Workflow

1. **Draft**: Create or upload contract
2. **Review**: Use AI review and manual review
3. **Edit**: Make necessary changes
4. **Approve**: Get internal approvals
5. **Share**: Share with clients or parties
6. **Sign**: Track signature status
7. **Archive**: Store completed contracts

## Best Practices

- Use AI generation for standard contracts
- Always review AI-generated content
- Maintain version history for all contracts
- Use comparison tools before signing
- Keep contracts linked to matters and clients
- Regularly review contract templates`,
    },
    {
      title: 'Calendar & Tasks Guide',
      description: 'Manage your schedule, deadlines, and tasks effectively',
      content: `# Calendar & Tasks Guide

## Overview

The Calendar module helps you manage hearings, meetings, deadlines, and tasks in one centralized location.

## Calendar View

### Viewing Calendar
- **Month View**: See all events for the month
- **Week View**: Detailed weekly schedule
- **Day View**: Hourly breakdown of a single day
- **Agenda View**: List of upcoming events

### Event Types
- **Hearings**: Court hearings and legal proceedings
- **Meetings**: Client meetings, team meetings
- **Deadlines**: Important dates and due dates
- **Tasks**: Action items and to-dos
- **Reminders**: Personal reminders

## Creating Events

### Adding a Calendar Event
1. Navigate to **Calendar** page
2. Click on a date or time slot
3. Fill in event details:
   - **Title**: Event name
   - **Date & Time**: Start and end times
   - **Type**: Select event type
   - **Matter**: Link to associated matter
   - **Attendees**: Add participants
   - **Location**: Meeting location or video link
   - **Description**: Additional notes
4. Set reminders if needed
5. Click **"Save"**

### Recurring Events
- Create events that repeat daily, weekly, monthly, or yearly
- Set end date for recurring series
- Edit individual occurrences or entire series

## Task Management

### Creating Tasks
1. From any matter or document, click **"Add Task"**
2. Or go to Calendar and create a task
3. Enter:
   - **Title**: Task description
   - **Due Date**: Deadline
   - **Priority**: Urgency level
   - **Assigned To**: Team member
   - **Related Matter**: Link to matter
4. Save task

### Managing Tasks
- View all tasks in calendar or task list
- Filter by status, priority, or assignee
- Mark tasks as complete
- Update task status and notes
- Set reminders for upcoming deadlines

## Best Practices

- Schedule all important dates immediately
- Set reminders for critical deadlines
- Link events to relevant matters
- Use recurring events for regular meetings
- Review calendar daily
- Keep task lists updated
- Set realistic deadlines
- Prioritize tasks appropriately`,
    },
    {
      title: 'Ream AI Assistant Guide',
      description: 'Leverage AI for research, document analysis, and legal assistance',
      content: `# Ream AI Assistant Guide

## Overview

Ream AI is a powerful Retrieval-Augmented Generation (RAG) agent that provides intelligent assistance across your entire legal practice management system.

## What Ream AI Can Do

### System-Wide Knowledge
Ream AI has access to:
- All your matters and cases
- Client information
- Documents and contracts
- Calendar events and tasks
- Invoices and billing data
- Organization statistics

### Capabilities
- **Answer Questions**: Ask about your practice data
- **Document Analysis**: Analyze contracts and legal documents
- **Research Assistance**: Help with legal research
- **Data Queries**: Get counts, statistics, and insights
- **Content Retrieval**: Find relevant information from your documents

## Using Ream AI

### Accessing Ream AI
1. Navigate to **Ream AI** from the sidebar
2. Or use the floating chat widget (bottom-right corner)
3. Start typing your question or request

### Asking Questions

**Examples of Questions:**
- "How many clients do I have?"
- "What are my active matters?"
- "Show me contracts expiring this month"
- "What documents are related to [matter name]?"
- "Analyze this contract for risks"
- "Summarize the key points in [document]"

### Document Analysis
1. Upload or select a document
2. Ask Ream AI to:
   - Summarize the document
   - Extract key clauses
   - Identify risks
   - Compare with other documents
   - Answer questions about the content

### Best Practices
- Be specific in your questions
- Reference matter names or document titles when relevant
- Use Ream AI for quick data lookups
- Leverage AI for initial document review
- Always verify AI responses for critical matters
- Use Ream AI to save time on routine queries

## Tips for Better Results

- **Be Specific**: "Show me all contracts for Client X" is better than "show contracts"
- **Use Context**: Reference specific matters, clients, or documents
- **Ask Follow-ups**: Build on previous responses
- **Verify Important Information**: Always double-check critical data

## Privacy & Security

- Ream AI only accesses data within your organization
- All queries are processed securely
- No data is shared outside your system
- Responses are based on your organization's data only`,
    },
    {
      title: 'Voice Recorder & Transcriptions Guide',
      description: 'Record meetings and automatically transcribe audio',
      content: `# Voice Recorder & Transcriptions Guide

## Overview

The Voice Recorder feature allows you to record audio (meetings, interviews, notes) and automatically transcribe them using AI.

## Recording Audio

### Starting a Recording
1. Navigate to **Voice Recorder** from the sidebar
2. Click the **"Record"** button
3. Grant microphone permissions if prompted
4. Speak clearly into your microphone
5. Click **"Stop"** when finished

### During Recording
- Monitor recording time
- Pause and resume as needed
- Add notes or markers during recording
- Link recording to a matter or client

### Saving Recordings
1. After stopping, review the recording
2. Add a title and description
3. Link to a matter or client if applicable
4. Add tags for organization
5. Click **"Save"**

## Transcriptions

### Automatic Transcription
- Recordings are automatically transcribed using AI
- Transcriptions appear in the **Transcriptions** page
- Processing time varies by recording length

### Viewing Transcriptions
1. Go to **Transcriptions** page
2. Click on any transcription to view
3. See:
   - Full transcript text
   - Timestamps for each segment
   - Speaker identification (if available)
   - Audio playback controls

### Editing Transcriptions
- Click on any text segment to edit
- Correct transcription errors
- Add speaker names
- Add notes or highlights
- Export edited transcript

## Using Transcriptions

### Linking to Matters
- Link transcriptions to relevant matters
- Add to case files
- Reference in case notes

### Export Options
- Export as text file
- Export as Word document
- Copy to clipboard
- Share with team members

## Best Practices

- Record in quiet environments for better accuracy
- Speak clearly and at moderate pace
- Use quality microphones when possible
- Review and edit transcriptions for accuracy
- Link transcriptions to relevant matters
- Add descriptive titles and tags
- Regularly review and organize transcriptions`,
    },
    {
      title: 'Invoicing Guide',
      description: 'Create, manage, and track invoices for your legal services',
      content: `# Invoicing Guide

## Overview

The Invoicing module helps you create, send, and track invoices for legal services rendered to clients.

## Creating an Invoice

### New Invoice
1. Navigate to **Invoices** page
2. Click **"New Invoice"** button
3. Fill in invoice details:
   - **Client**: Select the client
   - **Invoice Number**: Auto-generated or custom
   - **Date**: Invoice date
   - **Due Date**: Payment deadline
   - **Matter**: Link to associated matter (optional)
   - **Line Items**: Add services or products
     - Description
     - Quantity
     - Rate
     - Amount
   - **Notes**: Additional information
   - **Terms**: Payment terms
4. Review totals
5. Click **"Create Invoice"**

### Adding Line Items
- Click **"Add Line Item"**
- Enter service description
- Set quantity and rate
- Amount calculates automatically
- Add multiple line items as needed

## Managing Invoices

### Invoice List
- View all invoices in a list
- Filter by status (Draft, Sent, Paid, Overdue)
- Filter by client
- Search by invoice number or client name
- Sort by date, amount, or status

### Invoice Details
Click on any invoice to:
- View full invoice details
- Edit invoice (if not paid)
- Send invoice to client
- Mark as paid
- Download as PDF
- View payment history

### Invoice Status
- **Draft**: Not yet sent
- **Sent**: Sent to client
- **Paid**: Payment received
- **Overdue**: Past due date

## Sending Invoices

### Email Invoice
1. Open invoice details
2. Click **"Send Invoice"**
3. Review email recipient
4. Add custom message if needed
5. Send email with PDF attachment

### Download PDF
1. Open invoice
2. Click **"Download PDF"**
3. Save or print invoice
4. Send manually if preferred

## Payment Tracking

### Recording Payments
1. Open invoice details
2. Click **"Record Payment"**
3. Enter:
   - Payment amount
   - Payment date
   - Payment method
   - Reference number
4. Save payment

### Payment History
- View all payments for an invoice
- See payment dates and amounts
- Track partial payments
- View payment methods

## Best Practices

- Create invoices promptly after work completion
- Use clear, descriptive line items
- Set reasonable payment terms
- Follow up on overdue invoices
- Keep detailed payment records
- Link invoices to relevant matters
- Regularly review invoice status`,
    },
    {
      title: 'Settings & User Management Guide',
      description: 'Configure your account, organization, and user permissions',
      content: `# Settings & User Management Guide

## Overview

The Settings section allows you to manage your profile, organization settings, user permissions, and system configuration.

## Profile Settings

### Personal Information
1. Navigate to **Settings** > **Profile**
2. Update:
   - First and last name
   - Email address
   - Phone number
   - Profile picture
   - Timezone
   - Language preferences
3. Save changes

### Security Settings
- Change password
- Enable two-factor authentication (if available)
- Manage active sessions
- Review login history

### Notification Preferences
- Email notifications
- In-app notifications
- Notification frequency
- Types of notifications to receive

## Organization Settings

### Organization Profile
- Organization name
- Address and contact information
- Logo and branding
- Industry and type

### Organization Preferences
- Default timezone
- Date formats
- Currency settings
- Business hours

## User Management

### Adding Users
1. Go to **Settings** > **Users**
2. Click **"Add User"**
3. Enter:
   - Email address
   - Name
   - Role
   - Department (optional)
4. Send invitation

### Managing Users
- View all organization users
- Edit user information
- Deactivate or remove users
- Resend invitations

### Roles & Permissions
1. Navigate to **Settings** > **Roles**
2. View predefined roles:
   - **Admin**: Full system access
   - **Lawyer**: Access to matters, documents, contracts
   - **Staff**: Limited access based on assignment
   - **Client**: Read-only access to assigned matters
3. Create custom roles
4. Assign permissions to roles

### Permission Management
- Set resource-level permissions
- Control access to:
  - Matters
  - Clients
  - Documents
  - Contracts
  - Calendar
  - Invoices
  - Settings
- Assign permissions by role or user

## SSO Configuration

### Setting Up SSO
1. Go to **Settings** > **SSO**
2. Configure:
   - Provider (Google Workspace, Microsoft Entra ID)
   - Domain
   - Client ID and Secret
3. Test connection
4. Enable SSO for organization

## Best Practices

- Keep profile information current
- Use strong passwords
- Review user access regularly
- Assign appropriate roles
- Configure permissions carefully
- Test SSO before enabling
- Keep organization settings updated`,
    },
    {
      title: 'Security & Privacy Best Practices',
      description: 'Keep your data secure and maintain client confidentiality',
      content: `# Security & Privacy Best Practices

## Overview

Maintaining security and privacy is crucial in legal practice management. Follow these best practices to protect your data and client information.

## Account Security

### Strong Passwords
- Use complex passwords with:
  - At least 12 characters
  - Mix of uppercase and lowercase
  - Numbers and special characters
- Change passwords regularly
- Don't reuse passwords

### Two-Factor Authentication
- Enable 2FA when available
- Use authenticator apps
- Keep backup codes secure

### Session Management
- Log out when finished
- Don't share login credentials
- Review active sessions regularly
- Log out from shared devices

## Data Protection

### Access Control
- Assign appropriate user roles
- Limit access to sensitive data
- Review permissions regularly
- Remove access for former employees promptly

### Data Backup
- Regular backups are handled automatically
- Export important data periodically
- Keep local copies of critical documents

### Client Confidentiality
- Only share client data with authorized personnel
- Use secure sharing methods
- Don't discuss cases in public forums
- Maintain attorney-client privilege

## Best Practices

### Document Handling
- Use proper document classification
- Mark sensitive documents appropriately
- Limit document sharing
- Review document access logs

### Communication
- Use secure channels for client communication
- Encrypt sensitive emails
- Don't discuss cases on unsecured platforms
- Verify recipient identities

### System Usage
- Keep software updated
- Use secure networks
- Avoid public Wi-Fi for sensitive work
- Lock devices when unattended

### Compliance
- Follow data protection regulations
- Maintain audit trails
- Document access and changes
- Regular security reviews

## Reporting Issues

If you notice any security concerns:
1. Report immediately to your administrator
2. Change passwords if compromised
3. Review account activity
4. Contact support@kourti.com for assistance`,
    },
  ];

  // Filter FAQs based on search query
  const filteredFaqs = faqs.filter(
    (faq) =>
      searchQuery === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Here you would typically send the form data to your support system
    // For now, we'll just show a success toast
    toast.success('Support request submitted', {
      description: "We'll get back to you within 24 hours via email.",
    });

    // Reset form
    setSupportForm({
      name: '',
      email: '',
      subject: '',
      category: '',
      message: '',
    });
  };

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Help Center"
        description="Find answers to common questions and comprehensive guides to help you make the most of Kourti AI"
      />

      {/* Search */}
      <div className="relative max-w-2xl mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search for help articles, tutorials, and FAQs..."
          className="pl-10 py-6 text-base rounded-full border-muted-foreground/20"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Main content */}
      <Tabs defaultValue="faqs" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="faqs" className="flex items-center gap-2 py-3">
            <HelpCircle className="h-4 w-4" />
            <span>Frequently Asked Questions</span>
          </TabsTrigger>
          <TabsTrigger value="guides" className="flex items-center gap-2 py-3">
            <FileText className="h-4 w-4" />
            <span>User Guides</span>
          </TabsTrigger>
          <TabsTrigger value="support" className="flex items-center gap-2 py-3">
            <MessageCircle className="h-4 w-4" />
            <span>Contact Support</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="faqs">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Frequently Asked Questions
              </CardTitle>
              <CardDescription>
                Quick answers to common questions about using Kourti AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredFaqs.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaqs.map((faq, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                      <AccordionTrigger className="text-left font-medium">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-muted-foreground">{faq.answer}</p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="text-center py-12">
                  <HelpCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">No results found</p>
                  <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                    Try searching with different keywords or browse other sections
                  </p>
                  <Button variant="outline" onClick={() => setSearchQuery('')}>
                    Clear Search
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guides">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Book className="h-5 w-5 text-primary" />
                User Guides &amp; Documentation
              </CardTitle>
              <CardDescription>
                Comprehensive documentation and guides for Kourti AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {guides.map((guide, index) => (
                  <Card key={index} className="overflow-hidden">
                    <CardHeader>
                      <CardTitle className="text-lg">{guide.title}</CardTitle>
                      <CardDescription>{guide.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-foreground bg-muted/50 p-4 rounded-lg overflow-x-auto">
                          {guide.content}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                Contact Support
              </CardTitle>
              <CardDescription>
                Need help with something specific? Our support team is here to assist you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Contact Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Get in Touch</h3>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <Mail className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">Email Support</div>
                        <a
                          href="mailto:support@kourti.com"
                          className="text-sm text-primary hover:underline"
                        >
                          support@kourti.com
                        </a>
                        <div className="text-xs text-muted-foreground">
                          Response within 24 hours
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Support Request Form */}
                <div>
                  <h3 className="font-semibold text-lg mb-4">Submit a Support Request</h3>

                  <form onSubmit={handleSupportSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="support-name">Name *</Label>
                        <Input
                          id="support-name"
                          placeholder="Your full name"
                          value={supportForm.name}
                          onChange={(e) => setSupportForm({ ...supportForm, name: e.target.value })}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="support-email">Email *</Label>
                        <Input
                          id="support-email"
                          type="email"
                          placeholder="your@email.com"
                          value={supportForm.email}
                          onChange={(e) =>
                            setSupportForm({ ...supportForm, email: e.target.value })
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="support-category">Category</Label>
                      <Select
                        value={supportForm.category}
                        onValueChange={(value) =>
                          setSupportForm({ ...supportForm, category: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technical">Technical Issue</SelectItem>
                          <SelectItem value="billing">Billing Question</SelectItem>
                          <SelectItem value="feature">Feature Request</SelectItem>
                          <SelectItem value="account">Account Management</SelectItem>
                          <SelectItem value="training">Training & Onboarding</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="support-subject">Subject *</Label>
                      <Input
                        id="support-subject"
                        placeholder="Brief description of your issue"
                        value={supportForm.subject}
                        onChange={(e) =>
                          setSupportForm({ ...supportForm, subject: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="support-message">Message *</Label>
                      <Textarea
                        id="support-message"
                        placeholder="Please provide detailed information about your question or issue..."
                        rows={4}
                        value={supportForm.message}
                        onChange={(e) =>
                          setSupportForm({ ...supportForm, message: e.target.value })
                        }
                        required
                      />
                    </div>

                    <Button type="submit" className="w-full">
                      <Send className="h-4 w-4 mr-2" />
                      Submit Support Request
                    </Button>
                  </form>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Support section */}
      <Card className="shadow-sm mt-8 bg-muted/30">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">Need additional help?</h2>
              <p className="text-muted-foreground">
                Our support team is available to assist you with any questions or issues.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => navigate('/changelog')}
              >
                <History className="h-4 w-4" />
                <span>Changelog</span>
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                <span>Knowledge Base</span>
              </Button>
              <Button
                className="flex items-center gap-2"
                onClick={() => {
                  const tabsTrigger = document.querySelector('[value="support"]') as HTMLElement;
                  tabsTrigger?.click();
                }}
              >
                <MessageCircle className="h-4 w-4" />
                <span>Contact Support</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
