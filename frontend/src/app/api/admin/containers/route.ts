import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { containerManager } from '@/lib/container-manager';
import { prisma } from '@/lib/db';

// Check if user is admin
async function isAdmin(userId: string): Promise<boolean> {
  // TODO: Implement proper admin role checking
  // For now, check if user has admin in their email or a specific admin flag
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
    const status = url.searchParams.get('status') as any;
    const userId = url.searchParams.get('userId') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const containers = await containerManager.getAllContainers({
      status,
      userId,
      limit,
      offset
    });

    return NextResponse.json(containers);
  } catch (error) {
    console.error('Error getting admin containers:', error);
    return NextResponse.json(
      { error: 'Failed to get containers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const { action, containerId, userId: targetUserId, status, reason } = await request.json();

    if (!action) {
      return NextResponse.json(
        { error: 'Missing action' },
        { status: 400 }
      );
    }

    let result;
    switch (action) {
      case 'force_cleanup':
        if (!reason) {
          return NextResponse.json(
            { error: 'Reason required for force cleanup' },
            { status: 400 }
          );
        }
        result = await containerManager.forceCleanupContainers({
          userId: targetUserId,
          status,
          adminUserId: user.id,
          reason
        });
        break;
      
      case 'delete':
        if (!containerId || !reason) {
          return NextResponse.json(
            { error: 'Container ID and reason required for delete' },
            { status: 400 }
          );
        }
        await containerManager.deleteContainer(containerId, user.id, reason);
        result = { message: 'Container deleted successfully' };
        break;
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in admin container management:', error);
    return NextResponse.json(
      { error: 'Failed to perform admin action' },
      { status: 500 }
    );
  }
} 