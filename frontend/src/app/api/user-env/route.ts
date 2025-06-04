import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
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

    // Get user environment configuration
    const userEnv = await prisma.userEnv.findUnique({
      where: { userId: user.id }
    });

    if (!userEnv) {
      // Create default environment configuration
      const defaultEnv = await prisma.userEnv.create({
        data: {
          userId: user.id,
          config: {
            theme: 'dark',
            tools: ['nodejs', 'git', 'curl'],
            editor: 'vim',
            shell: 'bash',
            preferences: {
              autoSave: true,
              fontSize: 14,
              tabSize: 2,
              lineNumbers: true,
              wordWrap: true
            },
            environment: {
              NODE_VERSION: '18',
              TIMEZONE: 'UTC'
            }
          }
        }
      });
      return NextResponse.json(defaultEnv.config);
    }

    return NextResponse.json(userEnv.config);
  } catch (error) {
    console.error('Error getting user environment:', error);
    return NextResponse.json(
      { error: 'Failed to get user environment' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await request.json();

    // Get user
    const user = await prisma.user.findUnique({
      where: { auth0Id: session.user.sub }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update or create user environment
    const userEnv = await prisma.userEnv.upsert({
      where: { userId: user.id },
      update: { config },
      create: {
        userId: user.id,
        config
      }
    });

    return NextResponse.json({ 
      message: 'Environment configuration updated successfully',
      config: userEnv.config
    });
  } catch (error) {
    console.error('Error updating user environment:', error);
    return NextResponse.json(
      { error: 'Failed to update user environment' },
      { status: 500 }
    );
  }
} 