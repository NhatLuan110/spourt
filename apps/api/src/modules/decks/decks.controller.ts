import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  addDeckItemsSchema,
  createDeckSchema,
  reorderDeckItemsSchema,
  updateDeckSchema,
} from '@sprout/shared';
import type {
  AddDeckItemsInput,
  CreateDeckInput,
  ReorderDeckItemsInput,
  UpdateDeckInput,
} from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { DecksService } from './decks.service';

const deckParamSchema = z.object({ deckId: z.string().min(1) });
const itemParamSchema = z.object({ deckId: z.string().min(1), itemId: z.string().min(1) });

@ApiTags('decks')
@Controller('me/decks')
export class DecksController {
  constructor(private readonly decks: DecksService) {}

  @Get()
  @ApiOperation({ summary: 'Every deck with how many cards are due in it' })
  list(@CurrentUser('id') userId: string) {
    return this.decks.list(userId);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(createDeckSchema)) body: CreateDeckInput,
  ) {
    return this.decks.create(userId, body);
  }

  @Get(':deckId')
  detail(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(deckParamSchema)) params: { deckId: string },
  ) {
    return this.decks.detail(userId, params.deckId);
  }

  @Patch(':deckId')
  update(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(deckParamSchema)) params: { deckId: string },
    @Body(zodPipe(updateDeckSchema)) body: UpdateDeckInput,
  ) {
    return this.decks.update(userId, params.deckId, body);
  }

  @Delete(':deckId')
  remove(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(deckParamSchema)) params: { deckId: string },
  ) {
    return this.decks.remove(userId, params.deckId);
  }

  @Post(':deckId/items')
  @ApiOperation({ summary: 'Add words, optionally enqueuing them for review' })
  addItems(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(deckParamSchema)) params: { deckId: string },
    @Body(zodPipe(addDeckItemsSchema)) body: AddDeckItemsInput,
  ) {
    return this.decks.addItems(userId, params.deckId, body);
  }

  @Patch(':deckId/items')
  @ApiOperation({ summary: 'Reorder the cards in a deck' })
  reorder(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(deckParamSchema)) params: { deckId: string },
    @Body(zodPipe(reorderDeckItemsSchema)) body: ReorderDeckItemsInput,
  ) {
    return this.decks.reorder(userId, params.deckId, body);
  }

  @Delete(':deckId/items/:itemId')
  removeItem(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(itemParamSchema)) params: { deckId: string; itemId: string },
  ) {
    return this.decks.removeItem(userId, params.deckId, params.itemId);
  }
}
