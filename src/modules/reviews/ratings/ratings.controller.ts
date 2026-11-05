import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RatingsService } from './ratings.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';

@ApiTags('Reviews & Ratings')
@Controller({ version: '1' })
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post('mentorships/:id/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Leave a review for a mentorship' })
  @ApiResponse({ status: 201, description: 'Review created' })
  @ApiResponse({ status: 400, description: 'Mentorship is not active or completed' })
  @ApiResponse({ status: 403, description: 'Not the mentee of this mentorship' })
  @ApiResponse({ status: 409, description: 'Already reviewed' })
  createReview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.ratingsService.createReview(user.userId, id, dto);
  }

  @Get('mentorships/:id/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get my review for a mentorship (or null)' })
  @ApiResponse({ status: 200, description: 'Review or null' })
  getMyReview(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.ratingsService.getMyReview(user.userId, id);
  }

  @Public()
  @Get('mentors/:slugOrId/reviews')
  @ApiOperation({ summary: 'Public reviews and rating breakdown for a mentor' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved' })
  @ApiResponse({ status: 404, description: 'Mentor not found' })
  getMentorReviews(@Param('slugOrId') slugOrId: string, @Query() query: QueryReviewsDto) {
    return this.ratingsService.getMentorReviews(slugOrId, query);
  }

  @Get('mentor/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Feedback I received as a mentor' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved' })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  getMyReceivedReviews(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryReviewsDto) {
    return this.ratingsService.getMyReceivedReviews(user.userId, query);
  }
}