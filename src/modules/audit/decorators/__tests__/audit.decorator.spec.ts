import { AuditAction } from '@prisma/client';

import { Audit, AUDIT_KEY } from '../audit.decorator';

describe('Audit', () => {
  it('sets the action and entityType as handler metadata', () => {
    class Controller {
      @Audit(AuditAction.CATEGORY_CREATED, 'Category')
      handler(): void {
        /* stand-in for a route handler */
      }
    }

    expect(Reflect.getMetadata(AUDIT_KEY, Controller.prototype.handler)).toEqual({
      action: AuditAction.CATEGORY_CREATED,
      entityType: 'Category',
    });
  });
});
