import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Calendar,
    Search,
    Plus,
    Edit,
    Trash2,
    AlertCircle,
    CheckCircle2,
    Info,
    Sparkles,
    Bug,
    Shield,
    TrendingUp,
    FileText,
    Clock
} from "lucide-react";

interface ChangelogEntry {
    version: string;
    date: string;
    changes: {
        added?: string[];
        changed?: string[];
        deprecated?: string[];
        removed?: string[];
        fixed?: string[];
        security?: string[];
        improved?: string[];
    };
}

export default function Changelog() {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");

    // Changelog data - in a real app, this would come from an API or markdown file
    const changelog: ChangelogEntry[] = [
        {
            version: "1.2.0",
            date: "2025-12-16",
            changes: {
                added: [
                    "Live Document Editing: Users can now edit documents directly within the document module using a rich text editor",
                    "AI-Generated Contract Editing: Live editing capability for AI-generated contracts directly on screen",
                    "Document Download: Added ability to download generated contracts as .doc or .pdf files",
                    "TipTap Editor Integration: Integrated TipTap rich text editor for enhanced document editing experience"
                ],
                improved: [
                    "Document viewer now supports inline editing",
                    "Contract creation workflow enhanced with live preview and editing",
                    "Better document processing status visibility"
                ]
            }
        },
        {
            version: "1.1.0",
            date: "2025-12-12",
            changes: {
                added: [
                    "Docker Support: Full Docker containerization for the application",
                    "Docker Compose configuration for easy deployment",
                    "Nginx configuration for production deployments"
                ],
                improved: [
                    "Development environment setup streamlined",
                    "Better deployment consistency across environments"
                ]
            }
        },
        {
            version: "0.8.0",
            date: "2025-10-15",
            changes: {
                added: [
                    "Help Center: Comprehensive help center with FAQs, video tutorials, and user guides",
                    "Contact Support: Integrated support request form",
                    "Live Chat: Added live chat support during business hours"
                ],
                improved: [
                    "Better user onboarding experience",
                    "Enhanced documentation and guides"
                ]
            }
        },
        {
            version: "0.7.0",
            date: "2025-09-20",
            changes: {
                added: [
                    "Analytics Dashboard: Advanced analytics for case management",
                    "Bulk Import: Import multiple cases and documents at once",
                    "User Management: Enhanced user and permission management"
                ],
                improved: [
                    "Dashboard performance optimizations",
                    "Better data visualization"
                ]
            }
        },
        {
            version: "0.6.0",
            date: "2025-08-10",
            changes: {
                added: [
                    "Contract Management: Full contract lifecycle management",
                    "Contract Templates: Pre-built contract templates",
                    "Contract Comparison: Side-by-side contract comparison tool",
                    "Version History: Track all contract versions and changes"
                ],
                improved: [
                    "Document organization and tagging",
                    "Search functionality across contracts"
                ]
            }
        },
        {
            version: "0.5.0",
            date: "2025-07-01",
            changes: {
                added: [
                    "Document Management: Upload, organize, and manage legal documents",
                    "Document Review: AI-powered document review and analysis",
                    "ReamAI Integration: AI assistant for legal research and document analysis"
                ],
                improved: [
                    "File upload performance",
                    "Document search capabilities"
                ]
            }
        },
        {
            version: "0.4.0",
            date: "2025-06-15",
            changes: {
                added: [
                    "Calendar Integration: Manage appointments and deadlines",
                    "Task Management: Create and track tasks within cases",
                    "Notifications: Real-time notifications for important events"
                ],
                improved: [
                    "Case timeline visualization",
                    "Activity tracking"
                ]
            }
        },
        {
            version: "0.3.0",
            date: "2025-05-20",
            changes: {
                added: [
                    "Client Management: Comprehensive client profiles and management",
                    "Client Portal: Secure client access to case information",
                    "Client Communication: Integrated messaging with clients"
                ],
                improved: [
                    "Client onboarding process",
                    "Data security and privacy controls"
                ]
            }
        },
        {
            version: "0.2.0",
            date: "2025-04-10",
            changes: {
                added: [
                    "Case Management: Create, edit, and manage legal cases/matters",
                    "Case Activities: Track all activities within a case",
                    "Case Details: Detailed case information and documentation"
                ],
                improved: [
                    "User interface consistency",
                    "Navigation and routing"
                ]
            }
        },
        {
            version: "0.1.0",
            date: "2025-03-01",
            changes: {
                added: [
                    "Authentication System: Secure login and registration",
                    "User Roles & Permissions: Role-based access control",
                    "Organization Setup: Multi-tenant organization support",
                    "Dashboard: Initial dashboard with key metrics",
                    "Settings: User and organization settings management"
                ]
            }
        }
    ];

    // Get icon and color for change type
    const getChangeTypeInfo = (type: string) => {
        switch (type) {
            case 'added':
                return { icon: Plus, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950', label: 'Added' };
            case 'improved':
                return { icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950', label: 'Improved' };
            case 'fixed':
                return { icon: Bug, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950', label: 'Fixed' };
            case 'changed':
                return { icon: Edit, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950', label: 'Changed' };
            case 'deprecated':
                return { icon: AlertCircle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950', label: 'Deprecated' };
            case 'removed':
                return { icon: Trash2, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950', label: 'Removed' };
            case 'security':
                return { icon: Shield, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950', label: 'Security' };
            default:
                return { icon: Info, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-950', label: 'Info' };
        }
    };

    // Filter changelog based on search and category
    const filteredChangelog = changelog.filter(entry => {
        const matchesSearch = searchQuery === "" ||
            entry.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
            entry.date.includes(searchQuery) ||
            Object.values(entry.changes).some(changes =>
                changes?.some(change => change.toLowerCase().includes(searchQuery.toLowerCase()))
            );

        if (selectedCategory === "all") return matchesSearch;

        return matchesSearch && entry.changes[selectedCategory as keyof typeof entry.changes]?.length;
    });

    return (
        <div className="px-4 py-6 space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold text-foreground">Changelog</h1>
                </div>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                    Track all customer-facing changes, new features, improvements, and bug fixes to Kourti Legal Hub
                </p>
            </div>

            {/* Search and Filter */}
            <Card className="shadow-sm">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search changelog by version, date, or feature..."
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Category Filter */}
                        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full md:w-auto">
                            <TabsList className="grid grid-cols-4 md:grid-cols-8 w-full">
                                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                                <TabsTrigger value="added" className="text-xs">Added</TabsTrigger>
                                <TabsTrigger value="improved" className="text-xs">Improved</TabsTrigger>
                                <TabsTrigger value="fixed" className="text-xs">Fixed</TabsTrigger>
                                <TabsTrigger value="changed" className="text-xs">Changed</TabsTrigger>
                                <TabsTrigger value="deprecated" className="text-xs">Deprecated</TabsTrigger>
                                <TabsTrigger value="removed" className="text-xs">Removed</TabsTrigger>
                                <TabsTrigger value="security" className="text-xs">Security</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </CardContent>
            </Card>

            {/* Changelog Entries */}
            <div className="space-y-6">
                {filteredChangelog.length > 0 ? (
                    filteredChangelog.map((entry, index) => (
                        <Card key={entry.version} className="shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="border-b bg-muted/30">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-3">
                                            <Badge variant="outline" className="text-base font-mono px-3 py-1">
                                                v{entry.version}
                                            </Badge>
                                            {index === 0 && (
                                                <Badge className="bg-gradient-to-r from-primary to-primary/80">
                                                    <Sparkles className="h-3 w-3 mr-1" />
                                                    Latest
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="flex items-center gap-2 mt-2">
                                            <Calendar className="h-4 w-4" />
                                            {new Date(entry.date).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="space-y-6">
                                    {Object.entries(entry.changes).map(([type, changes]) => {
                                        if (!changes || changes.length === 0) return null;

                                        const { icon: Icon, color, bg, label } = getChangeTypeInfo(type);

                                        return (
                                            <div key={type} className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-md ${bg}`}>
                                                        <Icon className={`h-4 w-4 ${color}`} />
                                                    </div>
                                                    <h3 className={`font-semibold ${color}`}>{label}</h3>
                                                </div>
                                                <ul className="space-y-2 ml-8">
                                                    {changes.map((change, idx) => (
                                                        <li key={idx} className="flex items-start gap-3 text-sm text-muted-foreground">
                                                            <CheckCircle2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${color}`} />
                                                            <span>{change}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <Card className="shadow-sm">
                        <CardContent className="py-12">
                            <div className="text-center">
                                <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No results found</h3>
                                <p className="text-muted-foreground mb-4">
                                    Try adjusting your search or filter to find what you're looking for
                                </p>
                                <button
                                    onClick={() => {
                                        setSearchQuery("");
                                        setSelectedCategory("all");
                                    }}
                                    className="text-primary hover:underline"
                                >
                                    Clear filters
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Legend */}
            <Card className="shadow-sm bg-muted/30">
                <CardHeader>
                    <CardTitle className="text-lg">Legend</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {['added', 'improved', 'fixed', 'changed', 'deprecated', 'removed', 'security'].map(type => {
                            const { icon: Icon, color, bg, label } = getChangeTypeInfo(type);
                            return (
                                <div key={type} className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-md ${bg}`}>
                                        <Icon className={`h-4 w-4 ${color}`} />
                                    </div>
                                    <span className="text-sm font-medium">{label}</span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Footer Info */}
            <Card className="shadow-sm border-primary/20">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Clock className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Stay Updated</h3>
                            <p className="text-sm text-muted-foreground">
                                This changelog is updated with every release. Check back regularly to see what's new,
                                or subscribe to our newsletter to get updates delivered to your inbox.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
