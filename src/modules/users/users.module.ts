import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { AdminUsersController } from './controllers/admin-users.controller';
import { CitiesController } from './controllers/cities.controller';
import { SavedAddressesController } from './controllers/saved-addresses.controller';
import { UsersController } from './controllers/users.controller';
import { AdminUsersService } from './services/admin-users.service';
import { CitiesService } from './services/cities.service';
import { DataExportService } from './services/data-export.service';
import { SavedAddressesService } from './services/saved-addresses.service';
import { UsersService } from './services/users.service';

/**
 * F-02 (MODULES.md › UsersModule).
 *
 * Depends on AuthModule for `TokenService`: deactivating an account has to revoke its
 * sessions, and session revocation belongs to the module that issues them rather than
 * being reimplemented here.
 */
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [UsersController, CitiesController, SavedAddressesController, AdminUsersController],
  providers: [
    UsersService,
    CitiesService,
    DataExportService,
    SavedAddressesService,
    AdminUsersService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
