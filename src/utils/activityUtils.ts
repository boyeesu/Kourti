// Utility functions for activity management

export function getActivityIcon(type: string): string {
  const iconMap: Record<string, string> = {
    'hearing': '⚖️',
    'meeting': '👥',
    'deposition': '📝',
    'research': '🔍',
    'filing': '📄',
    'negotiation': '🤝',
    'investigation': '🕵️',
    'document_review': '📋',
    'mediation': '🤲',
    'consultation': '💬',
    'preparation': '📚',
    'follow_up': '📞',
  };

  return iconMap[type] || '📝'; // Default icon for unknown types
}

export function formatActivityTypeLabel(type: string): string {
  const typeMap: Record<string, string> = {
    'hearing': 'Court Hearing',
    'meeting': 'Client Meeting',
    'deposition': 'Deposition',
    'research': 'Legal Research',
    'filing': 'Court Filing',
    'negotiation': 'Negotiation',
    'investigation': 'Investigation',
    'document_review': 'Document Review',
    'mediation': 'Mediation',
    'consultation': 'Consultation',
    'preparation': 'Case Preparation',
    'follow_up': 'Follow-up',
  };

  return typeMap[type] || type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

export function getActivityStatusColor(status: string): string {
  switch (status) {
    case 'completed': 
      return 'bg-success text-success-foreground';
    case 'in_progress': 
      return 'bg-warning text-warning-foreground';
    case 'cancelled': 
      return 'bg-destructive text-destructive-foreground';
    default: 
      return 'bg-muted text-muted-foreground';
  }
}