import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, Phone, MapPin, Clock, MessageSquare, Calendar } from 'lucide-react';
import { useState } from 'react';
import { postJson } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import SEO from '@/components/SEO';

const Contact = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    phone: '',
    firmSize: '',
    interest: '',
    message: '',
    website: '', // honeypot
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSelectChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const data = await postJson<{ success: boolean; message?: string }>(
        '/api/v1/public/contact',
        formData
      );

      toast({
        title: 'Message sent!',
        description: data.message || "We'll get back to you within 24 hours.",
      });

      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        company: '',
        phone: '',
        firmSize: '',
        interest: '',
        message: '',
        website: '',
      });
    } catch (error: any) {
      console.error('Error submitting form:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="min-h-screen bg-background relative">
      <SEO
        title="Contact Us"
        description="Get in touch with the Kourti Legal team. Book a demo, request support, or ask about our AI-powered legal practice management platform. We respond within 24 hours."
        path="/contact"
      />
      <MouseFollowGlow />
      <Navigation />
      <main className="pt-24 relative z-10">
        {/* Hero Section */}
        <section className="py-16 bg-gradient-subtle">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
              Talk to the <span className="text-gradient">Kourti team.</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              Tell us about your practice and we'll recommend the best setup, whether a trial or
              guided demo.
            </p>
          </div>
        </section>

        {/* Contact Options */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Contact Form */}
              <div>
                <h2 className="text-3xl font-bold text-foreground mb-6">Send us a message</h2>
                <p className="text-muted-foreground mb-8">
                  We respond within 24 hours (Mon–Fri). Prefer a walkthrough?{' '}
                  <a
                    href="https://cal.com/kourti-legal/discovery"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Book a demo call
                  </a>
                  .
                </p>

                <form className="space-y-6" onSubmit={handleSubmit}>
                  {/* Honeypot: hidden from users, catches form-filling bots. */}
                  <input
                    type="text"
                    id="website"
                    name="website"
                    value={formData.website || ''}
                    onChange={handleInputChange}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="firstName"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        First Name *
                      </label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        required
                        value={formData.firstName}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="lastName"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Last Name *
                      </label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        required
                        value={formData.lastName}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Email Address *
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@lawfirm.com"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="company"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Firm / Organization
                    </label>
                    <Input
                      id="company"
                      placeholder="Doe & Associates"
                      value={formData.company}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Phone Number
                    </label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={formData.phone}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="firmSize"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Firm Size
                    </label>
                    <Select
                      value={formData.firmSize}
                      onValueChange={(value) => handleSelectChange('firmSize', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your firm size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solo">Solo Practitioner</SelectItem>
                        <SelectItem value="small">2-10 attorneys</SelectItem>
                        <SelectItem value="medium">11-50 attorneys</SelectItem>
                        <SelectItem value="large">51-200 attorneys</SelectItem>
                        <SelectItem value="enterprise">200+ attorneys</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label
                      htmlFor="interest"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      What do you want to improve? *
                    </label>
                    <Select
                      value={formData.interest}
                      onValueChange={(value) => handleSelectChange('interest', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your primary interest" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contract-review">Contract review speed</SelectItem>
                        <SelectItem value="matter-tracking">
                          Matter tracking & organization
                        </SelectItem>
                        <SelectItem value="deadline-management">Deadline management</SelectItem>
                        <SelectItem value="client-management">Client management</SelectItem>
                        <SelectItem value="demo">Just want to see a demo</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Message *
                    </label>
                    <Textarea
                      id="message"
                      placeholder="Tell us about your needs and how we can help..."
                      rows={4}
                      required
                      value={formData.message}
                      onChange={handleInputChange}
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gradient-primary text-primary-foreground hover:shadow-glow"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </Button>

                  <p className="text-sm text-muted-foreground">
                    By submitting this form, you agree to our Privacy Policy and Terms of Service.
                  </p>
                </form>
              </div>

              {/* Contact Information */}
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-bold text-foreground mb-6">
                    Other Ways to Reach Us
                  </h2>

                  <div className="space-y-6">
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="bg-primary/10 p-3 rounded-lg">
                            <Phone className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground mb-1">Phone Support</h3>
                            <p className="text-muted-foreground mb-2">
                              Speak directly with our legal tech specialists
                            </p>
                            <p className="font-medium text-foreground">+234 (80) 8433 1425</p>
                            <p className="text-sm text-muted-foreground">
                              Mon-Fri, 9 AM - 6 PM PST
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="bg-primary/10 p-3 rounded-lg">
                            <Mail className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground mb-1">Email Support</h3>
                            <p className="text-muted-foreground mb-2">
                              Get detailed answers to your questions
                            </p>
                            <p className="font-medium text-foreground">support@kourti.com</p>
                            <p className="text-sm text-muted-foreground">
                              Response within 24 hours
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="bg-primary/10 p-3 rounded-lg">
                            <Calendar className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground mb-1">Schedule a Demo</h3>
                            <p className="text-muted-foreground mb-2">
                              See Kourti Legal Hub in action
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                window.open('https://cal.com/kourti-legal/discovery', '_blank')
                              }
                            >
                              Book Demo Call
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Business Hours */}
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">Business Hours</h3>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="bg-primary/10 p-3 rounded-lg">
                          <Clock className="h-6 w-6 text-primary" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Monday - Friday</span>
                            <span className="font-medium text-foreground">
                              {' '}
                              9:00 AM - 6:00 PM PST
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Saturday</span>
                            <span className="font-medium text-foreground">
                              {' '}
                              10:00 AM - 2:00 PM PST
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sunday</span>
                            <span className="font-medium text-foreground">Closed</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};
export default Contact;
