import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const users: CreateUserRequest[] = [
      {
        email: "hoangnguyen040796@gmail.com",
        password: "Test11",
        fullName: "Hoang Nguyen",
      },
      {
        email: "alex.obsidiandigital@gmail.com",
        password: "Test11",
        fullName: "Alex Obsidian",
      },
    ];

    const results = [];

    for (const user of users) {
      // Create user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: user.fullName,
        },
      });

      if (authError) {
        console.error(`Error creating user ${user.email}:`, authError);
        results.push({
          email: user.email,
          success: false,
          error: authError.message,
        });
      } else {
        console.log(`User created successfully: ${user.email}`);
        results.push({
          email: user.email,
          success: true,
          userId: authData.user?.id,
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in create-initial-users function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
