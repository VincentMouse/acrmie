import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting auto-cancellation of no-show appointments...');

    // Calculate the date 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(0, 0, 0, 0);

    // Find all no-show appointments that are older than 3 days and haven't been updated
    const { data: noShowAppointments, error: fetchError } = await supabase
      .from('appointments')
      .select('id, check_in_updated_at')
      .eq('check_in_status', 'no_show')
      .lt('check_in_updated_at', threeDaysAgo.toISOString());

    if (fetchError) {
      console.error('Error fetching no-show appointments:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${noShowAppointments?.length || 0} no-show appointments to cancel`);

    if (noShowAppointments && noShowAppointments.length > 0) {
      // Update all matching appointments to cancelled
      const appointmentIds = noShowAppointments.map(apt => apt.id);
      
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          check_in_status: 'cancelled',
          check_in_updated_at: new Date().toISOString(),
        })
        .in('id', appointmentIds);

      if (updateError) {
        console.error('Error updating appointments:', updateError);
        throw updateError;
      }

      console.log(`Successfully cancelled ${appointmentIds.length} no-show appointments`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${noShowAppointments?.length || 0} appointments`,
        cancelled: noShowAppointments?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in auto-cancel-no-show function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
