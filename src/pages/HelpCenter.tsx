import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpCircle, Search, FileText, MessageCircle, Video, Book, ExternalLink } from "lucide-react";

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = React.useState("");
  
  const faqs = [
    {
      question: "How do I create a new case?",
      answer: "You can create a new case by navigating to the 'Cases' page and clicking on the 'New Case' button in the top-right corner. Fill in the required details in the form and click 'Create Case'."
    },
    {
      question: "How do I upload documents to a case?",
      answer: "Navigate to the case details page by clicking on a case from the Cases list. Then, click on the 'Documents' tab and use the 'Upload Document' button to add files to the case."
    },
    {
      question: "Can I share documents with clients?",
      answer: "Yes, you can share documents with clients by navigating to the document, clicking the 'Share' button, and entering the client's email address. They will receive a secure link to access the document."
    },
    {
      question: "How do I generate a contract?",
      answer: "Go to the 'Contracts' page, click 'New Contract', and select a template. Fill in the required fields and click 'Generate'. You can then preview, edit, and finalize the contract."
    },
    {
      question: "How does the AI assistant work?",
      answer: "The Ream AI assistant can help with legal research, document analysis, and contract review. Navigate to the 'Ream AI' page, type your question or upload a document, and the AI will provide relevant information and insights."
    }
  ];
  
  const videos = [
    { title: "Getting Started with Kouti Legal", duration: "5:24", url: "#" },
    { title: "Managing Cases Effectively", duration: "8:15", url: "#" },
    { title: "Document Management Best Practices", duration: "6:42", url: "#" },
    { title: "Using the AI Assistant for Research", duration: "10:18", url: "#" },
    { title: "Calendar and Task Management", duration: "4:30", url: "#" }
  ];
  
  const guides = [
    { title: "Complete User Guide", description: "Comprehensive guide to all features", url: "#" },
    { title: "Case Management Workflow", description: "Best practices for case handling", url: "#" },
    { title: "Document Organization", description: "How to organize and tag documents", url: "#" },
    { title: "Client Portal Setup", description: "Setting up access for clients", url: "#" },
    { title: "Security Best Practices", description: "Keeping your data secure", url: "#" }
  ];
  
  // Filter FAQs based on search query
  const filteredFaqs = faqs.filter(faq => 
    searchQuery === "" || 
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-4 py-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Help Center</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Find answers to common questions, video tutorials, and comprehensive guides
          to help you make the most of Kouti Legal
        </p>
      </div>
      
      {/* Search */}
      <div className="relative max-w-xl mx-auto mb-8">
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
          <TabsTrigger value="videos" className="flex items-center gap-2 py-3">
            <Video className="h-4 w-4" />
            <span>Video Tutorials</span>
          </TabsTrigger>
          <TabsTrigger value="guides" className="flex items-center gap-2 py-3">
            <FileText className="h-4 w-4" />
            <span>User Guides</span>
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
                Quick answers to common questions about using Kouti Legal
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredFaqs.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaqs.map((faq, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                      <AccordionTrigger className="text-left font-medium">{faq.question}</AccordionTrigger>
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
                  <Button variant="outline" onClick={() => setSearchQuery("")}>
                    Clear Search
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="videos">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                Video Tutorials
              </CardTitle>
              <CardDescription>
                Step-by-step video guides for using Kouti Legal features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {videos.map((video, index) => (
                  <Card key={index} className="overflow-hidden">
                    <div className="h-40 bg-muted flex items-center justify-center">
                      <Video className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-medium mb-1">{video.title}</h3>
                      <p className="text-xs text-muted-foreground mb-3">{video.duration}</p>
                      <Button variant="outline" size="sm" className="w-full">
                        Watch Video
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
                Comprehensive documentation and guides for Kouti Legal
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {guides.map((guide, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-medium">{guide.title}</h3>
                      <p className="text-sm text-muted-foreground">{guide.description}</p>
                    </div>
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      View Guide
                    </Button>
                  </div>
                ))}
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
              <Button variant="outline" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                <span>Knowledge Base</span>
              </Button>
              <Button className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                <span>Contact Support</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}