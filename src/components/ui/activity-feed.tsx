import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  FileText, 
  MessageSquare, 
  Calendar, 
  UserPlus, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Edit
} from 'lucide-react';
import { useActivities } from '@/features/activities/api/useActivities';

interface ActivityFeedProps {
  caseId?: string;
  clientId?: string;
  contractId?: string;
  limit?: number;
  showTitle?: boolean;
}

export function ActivityFeed({ 
  caseId, 
  clientId, 
  contractId, 
  limit = 10, 
  showTitle = true 
}: ActivityFeedProps) {
  const { data: activities = [], isLoading } = useActivities({
    case_id: caseId,
    client_id: clientId,
    contract_id: contractId,
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'document_uploaded':
        return <FileText className="h-4 w-4" />;
      case 'comment':
        return <MessageSquare className="h-4 w-4" />;
      case 'meeting':
      case 'hearing':
        return <Calendar className="h-4 w-4" />;
      case 'client_added':
        return <UserPlus className="h-4 w-4" />;
      case 'task_completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'deadline':
        return <AlertCircle className="h-4 w-4" />;
      case 'case_updated':
      case 'contract_updated':
        return <Edit className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'document_uploaded':
        return 'text-blue-600 bg-blue-100';
      case 'comment':
        return 'text-green-600 bg-green-100';
      case 'meeting':
      case 'hearing':
        return 'text-purple-600 bg-purple-100';
      case 'client_added':
        return 'text-orange-600 bg-orange-100';
      case 'task_completed':
        return 'text-emerald-600 bg-emerald-100';
      case 'deadline':
        return 'text-red-600 bg-red-100';
      case 'case_updated':
      case 'contract_updated':
        return 'text-indigo-600 bg-indigo-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-start space-x-3 p-4 animate-pulse">
            <div className="w-8 h-8 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const displayActivities = limit ? activities.slice(0, limit) : activities;

  if (displayActivities.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showTitle && (
        <h3 className="text-lg font-semibold">Recent Activity</h3>
      )}
      
      <div className="space-y-3">
        {displayActivities.map((activity) => (
          <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
            <div className={`p-2 rounded-full ${getActivityColor(activity.activity_type)}`}>
              {getActivityIcon(activity.activity_type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {activity.title}
                  </p>
                  {activity.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {activity.description}
                    </p>
                  )}
                  <div className="flex items-center space-x-2 mt-2">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </p>
                    {activity.status && (
                      <Badge className={`text-xs ${getStatusColor(activity.status)}`}>
                        {activity.status}
                      </Badge>
                    )}
                    {activity.due_date && (
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 mr-1" />
                        Due: {new Date(activity.due_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                
                {activity.assigned_to && (
                  <Avatar className="h-6 w-6 ml-2">
                    <AvatarImage src="" alt="" />
                    <AvatarFallback className="text-xs">
                      {/* You can add user name initials here if available */}
                      U
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}