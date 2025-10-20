import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

interface DuplicateLeadInfo {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  created_by_profile: {
    nickname: string;
  } | null;
  created_by_role: string | null;
}

interface DuplicateLeadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  duplicateInfo: DuplicateLeadInfo | null;
}

export function DuplicateLeadDialog({ 
  isOpen, 
  onClose, 
  onProceed, 
  duplicateInfo 
}: DuplicateLeadDialogProps) {
  if (!duplicateInfo) return null;

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'sales_manager':
        return 'default';
      case 'tele_sales':
        return 'secondary';
      case 'customer_service':
        return 'outline';
      case 'online_sales':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const formatRole = (role: string | null) => {
    if (!role) return 'Unknown';
    return role.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duplicate Lead Detected</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-sm">
              <p className="text-base font-semibold">
                A lead with this phone number already exists in the system.
              </p>
              
              <div className="space-y-3 bg-muted p-4 rounded-lg">
                <div>
                  <span className="font-semibold">Name: </span>
                  {duplicateInfo.first_name} {duplicateInfo.last_name}
                </div>
                
                <div>
                  <span className="font-semibold">Phone: </span>
                  {duplicateInfo.phone}
                </div>
                
                <div>
                  <span className="font-semibold">Current Status: </span>
                  <Badge variant="outline" className="ml-2">
                    {duplicateInfo.status}
                  </Badge>
                </div>
                
                <div>
                  <span className="font-semibold">Last Ingested: </span>
                  {format(new Date(duplicateInfo.created_at), 'PPP p')}
                </div>
                
                <div>
                  <span className="font-semibold">Ingested By: </span>
                  {duplicateInfo.created_by_profile?.nickname || 'Unknown'}
                  {duplicateInfo.created_by_role && (
                    <Badge 
                      variant={getRoleBadgeVariant(duplicateInfo.created_by_role)} 
                      className="ml-2"
                    >
                      {formatRole(duplicateInfo.created_by_role)}
                    </Badge>
                  )}
                </div>
                
                <div>
                  <span className="font-semibold">Processed: </span>
                  {duplicateInfo.processed_at ? (
                    <>
                      Yes - {format(new Date(duplicateInfo.processed_at), 'PPP p')}
                    </>
                  ) : (
                    'Not yet processed'
                  )}
                </div>
              </div>

              <p className="text-destructive">
                Do you want to proceed with creating this duplicate lead?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onProceed}>
            Proceed Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}