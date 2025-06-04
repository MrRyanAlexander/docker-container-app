import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { containerManager } from '@/lib/container-manager';
import { prisma } from '@/lib/db';

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

    // Get user's container
    let container = await containerManager.getUserContainer(user.id);
    
    if (!container) {
      // Create default container for user
      container = await containerManager.createContainer({
        userId: user.id,
        name: 'default'
      });
    }

    return NextResponse.json(container);
  } catch (error) {
    console.error('Error getting container:', error);
    return NextResponse.json(
      { error: 'Failed to get container' },
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

    const { action, containerId } = await request.json();

    if (!action || !containerId) {
      return NextResponse.json(
        { error: 'Missing action or containerId' },
        { status: 400 }
      );
    }

    let result;
    switch (action) {
      case 'start':
        result = await containerManager.startContainer(containerId);
        break;
      case 'stop':
        result = await containerManager.stopContainer(containerId);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error managing container:', error);
    return NextResponse.json(
      { error: 'Failed to manage container' },
      { status: 500 }
    );
  }
} 