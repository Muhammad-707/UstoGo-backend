import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

import type { AppConfigService } from '@config/app-config.service';
import type { JwtStrategy } from '@modules/auth/strategies/jwt.strategy';

import {
  BookingAcceptedEvent,
  BookingCancelledEvent,
  BookingCompletedEvent,
  BookingCreatedEvent,
  BookingRejectedEvent,
  BookingStartedEvent,
} from '../../events/booking.events';
import { BookingsGateway } from '../bookings.gateway';

const build = () => {
  const jwt = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }),
  } as unknown as JwtService;
  const jwtStrategy = {
    validate: jest.fn().mockResolvedValue({ id: 'user-1', role: 'CLIENT' }),
  } as unknown as JwtStrategy;
  const config = {
    jwt: { accessPublicKey: 'pub', issuer: 'ustogo', audience: 'ustogo' },
  } as unknown as AppConfigService;

  const gateway = new BookingsGateway(jwt, jwtStrategy, config);

  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const server = { to } as unknown as Server;
  Object.defineProperty(gateway, 'server', { value: server, writable: true });

  return { gateway, jwt, jwtStrategy, to, emit };
};

const mockSocket = (token: string | undefined): Socket =>
  ({
    handshake: { auth: { token }, headers: {} },
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as Socket;

describe('BookingsGateway.handleConnection', () => {
  it('joins the caller’s user room on a valid token', async () => {
    const { gateway } = build();
    const socket = mockSocket('valid-token');

    await gateway.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledWith('user:user-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('rejects and disconnects when no token is present', async () => {
    const { gateway } = build();
    const socket = mockSocket(undefined);

    await gateway.handleConnection(socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects and disconnects when JWT verification fails', async () => {
    const { gateway, jwt } = build();
    (jwt.verifyAsync as jest.Mock).mockRejectedValue(new Error('bad token'));
    const socket = mockSocket('expired-token');

    await gateway.handleConnection(socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});

describe('BookingsGateway event relays', () => {
  it('pushes booking:update to the master on booking.created', () => {
    const { gateway, to, emit } = build();

    gateway.onCreated(new BookingCreatedEvent('b-1', 'master-1', 'Client', new Date(), 'Repair'));

    expect(to).toHaveBeenCalledWith('user:master-1');
    expect(emit).toHaveBeenCalledWith('booking:update', { bookingId: 'b-1', status: 'PENDING' });
  });

  it('pushes booking:update to the client on booking.accepted', () => {
    const { gateway, to, emit } = build();

    gateway.onAccepted(new BookingAcceptedEvent('b-1', 'client-1', 'Master', new Date()));

    expect(to).toHaveBeenCalledWith('user:client-1');
    expect(emit).toHaveBeenCalledWith('booking:update', { bookingId: 'b-1', status: 'ACCEPTED' });
  });

  it('pushes booking:update to the client on booking.rejected', () => {
    const { gateway, to, emit } = build();

    gateway.onRejected(new BookingRejectedEvent('b-1', 'client-1', 'Master', 'Not available'));

    expect(to).toHaveBeenCalledWith('user:client-1');
    expect(emit).toHaveBeenCalledWith('booking:update', { bookingId: 'b-1', status: 'REJECTED' });
  });

  it('pushes booking:update to the client on booking.started', () => {
    const { gateway, to, emit } = build();

    gateway.onStarted(new BookingStartedEvent('b-1', 'client-1', 'Master'));

    expect(emit).toHaveBeenCalledWith('booking:update', {
      bookingId: 'b-1',
      status: 'IN_PROGRESS',
    });
    expect(to).toHaveBeenCalledWith('user:client-1');
  });

  it('pushes booking:update to the client on booking.completed', () => {
    const { gateway, to, emit } = build();

    gateway.onCompleted(new BookingCompletedEvent('b-1', 'client-1', 'Master'));

    expect(emit).toHaveBeenCalledWith('booking:update', { bookingId: 'b-1', status: 'COMPLETED' });
    expect(to).toHaveBeenCalledWith('user:client-1');
  });

  it('pushes booking:update to whoever should be notified on booking.cancelled', () => {
    const { gateway, to, emit } = build();

    gateway.onCancelled(new BookingCancelledEvent('b-1', 'master-1', 'CLIENT', 'Change of plans'));

    expect(to).toHaveBeenCalledWith('user:master-1');
    expect(emit).toHaveBeenCalledWith('booking:update', { bookingId: 'b-1', status: 'CANCELLED' });
  });
});
