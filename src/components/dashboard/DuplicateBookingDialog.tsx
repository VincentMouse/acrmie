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

interface DuplicateBookingInfo {
  id: string;
  appointment_date: string;
  service_product: string;
  branch_name: string;
  confirmation_status: string;
  check_in_status: string | null;
  lead: {
    first_name: string;
    last_name: string;
    phone: string;
  };
}

interface DuplicateBookingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed?: () => void;
  duplicateInfo: DuplicateBookingInfo | null;
  canProceed: boolean;
  daysPassedSinceAppointment: number;
}

export function DuplicateBookingDialog({ 
  isOpen, 
  onClose, 
  onProceed,
  duplicateInfo,
  canProceed,
  daysPassedSinceAppointment
}: DuplicateBookingDialogProps) {
  if (!duplicateInfo) return null;

  const appointmentDate = new Date(duplicateInfo.appointment_date);
  const isPast = appointmentDate < new Date();

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {canProceed ? 'Duplicate Booking Warning' : 'Duplicate Booking Detected'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-sm">
              {!canProceed ? (
                <p className="text-base font-semibold text-destructive">
                  An active booking with this phone number already exists.
                </p>
              ) : (
                <p className="text-base font-semibold text-orange-600">
                  A recent booking ({daysPassedSinceAppointment} days ago) with this phone number was found.
                </p>
              )}
              
              <div className="space-y-3 bg-muted p-4 rounded-lg">
                <div>
                  <span className="font-semibold">Customer: </span>
                  {duplicateInfo.lead.first_name} {duplicateInfo.lead.last_name}
                </div>
                
                <div>
                  <span className="font-semibold">Phone: </span>
                  {duplicateInfo.lead.phone}
                </div>
                
                <div>
                  <span className="font-semibold">Service: </span>
                  {duplicateInfo.service_product}
                </div>
                
                <div>
                  <span className="font-semibold">Branch: </span>
                  {duplicateInfo.branch_name}
                </div>
                
                <div>
                  <span className="font-semibold">Appointment Date: </span>
                  {format(appointmentDate, 'PPP p')}
                  {isPast && (
                    <Badge variant="secondary" className="ml-2">
                      Past ({daysPassedSinceAppointment} days ago)
                    </Badge>
                  )}
                  {!isPast && (
                    <Badge variant="default" className="ml-2">
                      Upcoming
                    </Badge>
                  )}
                </div>
                
                <div>
                  <span className="font-semibold">Status: </span>
                  <Badge variant="outline" className="ml-2">
                    {duplicateInfo.confirmation_status}
                  </Badge>
                  {duplicateInfo.check_in_status && (
                    <Badge variant="secondary" className="ml-2">
                      {duplicateInfo.check_in_status}
                    </Badge>
                  )}
                </div>
              </div>

              {!canProceed ? (
                <div className="text-destructive space-y-2">
                  <p className="font-semibold">
                    You cannot create a new booking at this time.
                  </p>
                  <p>
                    Please contact Customer Service if the customer needs to reschedule or modify their appointment.
                  </p>
                </div>
              ) : (
                <p className="text-orange-600">
                  The previous appointment has passed, but it was recent. Are you sure you want to create a new booking?
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            {canProceed ? 'Cancel' : 'Close'}
          </AlertDialogCancel>
          {canProceed && onProceed && (
            <AlertDialogAction onClick={onProceed}>
              Create New Booking
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}