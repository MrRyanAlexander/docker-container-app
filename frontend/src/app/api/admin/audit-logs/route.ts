import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { containerManager } from '@/lib/container-manager';
import { prisma } from '@/lib/db';

// Check if user is admin
async function isAdmin(userId: string): Promise<boolean> {
  // TODO: Implement proper admin role checking
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  return user?.email?.includes('admin') || false;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get or create user in database
    const user = await prisma.user.upsert({
      where: { auth0Id: session.user.sub },
      update: {
        email: session.user.email,
        name: session.user.name,
        picture: session.user.picture,
      },
      create: {
        auth0Id: session.user.sub,
        email: session.user.email,
        name: session.user.name,
        picture: session.user.picture,
      },
    });

    // Check admin permissions
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const containerId = url.searchParams.get('containerId') || undefined;
    const userId = url.searchParams.get('userId') || undefined;
    const action = url.searchParams.get('action') as any;
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const logs = await containerManager.getAuditLogs({
      containerId,
      userId,
      action,
      limit
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Error getting audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to get audit logs' },
      { status: 500 }
    );
  }
} 