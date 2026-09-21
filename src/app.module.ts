import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './modules/identity/auth/guards/jwt-auth.guard';

// â”€â”€ Identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { AuthModule } from './modules/identity/auth/auth.module';
import { UsersModule } from './modules/identity/users/users.module';
import { SessionsModule } from './modules/identity/sessions/sessions.module';
import { AuthorizationModule } from './modules/identity/authorization/authorization.module';

// â”€â”€ Mentor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { ProfilesModule } from './modules/mentor/profiles/profiles.module';
import { ApplicationsModule as MentorApplicationsModule } from './modules/mentor/applications/applications.module';
import { VettingModule } from './modules/mentor/vetting/vetting.module';
import { KycModule } from './modules/mentor/kyc/kyc.module';
import { AvailabilityModule as MentorAvailabilityModule } from './modules/mentor/availability/availability.module';

// â”€â”€ Marketplace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { PlansModule } from './modules/marketplace/plans/plans.module';
import { SessionsModule as MarketplaceSessionsModule } from './modules/marketplace/sessions/sessions.module';
import { SearchModule } from './modules/marketplace/search/search.module';
import { CategoriesModule } from './modules/marketplace/categories/categories.module';
import { DiscoveryModule } from './modules/marketplace/discovery/discovery.module';

// â”€â”€ Mentorship â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { ApplicationsModule as MentorshipApplicationsModule } from './modules/mentorship/applications/applications.module';
import { LifecycleModule } from './modules/mentorship/lifecycle/lifecycle.module';
import { SessionsModule as MentorshipSessionsModule } from './modules/mentorship/sessions/sessions.module';
import { ReviewsModule as MentorshipReviewsModule } from './modules/mentorship/reviews/reviews.module';

// â”€â”€ Scheduling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { AvailabilityModule as SchedulingAvailabilityModule } from './modules/scheduling/availability/availability.module';
import { SlotsModule } from './modules/scheduling/slots/slots.module';
import { BookingsModule } from './modules/scheduling/bookings/bookings.module';
import { CalendarModule } from './modules/scheduling/calendar/calendar.module';

// â”€â”€ Messaging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { ConversationsModule } from './modules/messaging/conversations/conversations.module';
import { MessagesModule } from './modules/messaging/messages/messages.module';
import { AttachmentsModule } from './modules/messaging/attachments/attachments.module';
import { ModerationModule as MessagingModerationModule } from './modules/messaging/moderation/moderation.module';

// â”€â”€ Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { CheckoutModule } from './modules/payments/checkout/checkout.module';
import { ProvidersModule as PaymentProvidersModule } from './modules/payments/providers/providers.module';
import { WebhooksModule } from './modules/payments/webhooks/webhooks.module';
import { RefundsModule } from './modules/payments/refunds/refunds.module';

// â”€â”€ Commission â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { RulesModule } from './modules/commission/rules/rules.module';
import { CalculationModule } from './modules/commission/calculation/calculation.module';
import { RecordsModule } from './modules/commission/records/records.module';

// â”€â”€ Payouts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { BalanceModule } from './modules/payouts/balance/balance.module';
import { BatchesModule } from './modules/payouts/batches/batches.module';
import { ProvidersModule as PayoutProvidersModule } from './modules/payouts/providers/providers.module';
import { ReconciliationModule } from './modules/payouts/reconciliation/reconciliation.module';

// â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { InAppModule } from './modules/notifications/in-app/in-app.module';
import { EmailModule } from './modules/notifications/email/email.module';
import { SmsModule } from './modules/notifications/sms/sms.module';

// â”€â”€ Reviews â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { RatingsModule } from './modules/reviews/ratings/ratings.module';
import { ModerationModule as ReviewsModerationModule } from './modules/reviews/moderation/moderation.module';

// â”€â”€ Administration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { UsersModule as AdminUsersModule } from './modules/administration/users/users.module';
import { ConfigurationModule } from './modules/administration/configuration/configuration.module';
import { DisputesModule } from './modules/administration/disputes/disputes.module';
import { ModerationModule as AdminModerationModule } from './modules/administration/moderation/moderation.module';
import { ReportingModule } from './modules/administration/reporting/reporting.module';

// â”€â”€ Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { BlogModule } from './modules/content/blog/blog.module';
import { CareersModule } from './modules/content/careers/careers.module';
import { ResourcesModule } from './modules/content/resources/resources.module';

import { OnboardingModule as MenteeOnboardingModule } from './modules/mentee/onboarding/onboarding.module';

import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    // Global config — reads .env files & custom config factories
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [appConfig, databaseConfig, jwtConfig],
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Database
    PrismaModule,

    // Identity
    AuthModule,
    UsersModule,
    SessionsModule,
    AuthorizationModule,

    // Mentor
    ProfilesModule,
    MentorApplicationsModule,
    VettingModule,
    KycModule,
    MentorAvailabilityModule,

    // Mentee
    MenteeOnboardingModule,

    // Marketplace
    PlansModule,
    MarketplaceSessionsModule,
    SearchModule,
    CategoriesModule,
    DiscoveryModule,

    // Mentorship
    MentorshipApplicationsModule,
    LifecycleModule,
    MentorshipSessionsModule,
    MentorshipReviewsModule,

    // Scheduling
    SchedulingAvailabilityModule,
    SlotsModule,
    BookingsModule,
    CalendarModule,

    // Messaging
    ConversationsModule,
    MessagesModule,
    AttachmentsModule,
    MessagingModerationModule,

    // Payments
    CheckoutModule,
    PaymentProvidersModule,
    WebhooksModule,
    RefundsModule,

    // Commission
    RulesModule,
    CalculationModule,
    RecordsModule,

    // Payouts
    BalanceModule,
    BatchesModule,
    PayoutProvidersModule,
    ReconciliationModule,

    // Notifications
    InAppModule,
    EmailModule,
    SmsModule,

    // Reviews
    RatingsModule,
    ReviewsModerationModule,

    // Administration
    AdminUsersModule,
    ConfigurationModule,
    DisputesModule,
    AdminModerationModule,
    ReportingModule,

    // Content
    BlogModule,
    CareersModule,
    ResourcesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}


