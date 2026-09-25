import { Global, Module } from '@nestjs/common';
import { SecretBoxService } from './secret-box.service';

/** Global: several modules need to read a learner's stored key. */
@Global()
@Module({
  providers: [SecretBoxService],
  exports: [SecretBoxService],
})
export class CryptoModule {}
