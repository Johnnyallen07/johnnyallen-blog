import { IsString, IsInt, IsOptional, Min, Max, IsEnum } from 'class-validator';

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  TRUE_FALSE = 'true_false',
  SHORT_ANSWER = 'short_answer',
  FILL_IN_BLANK = 'fill_in_blank',
}

export class GenerateQuestionsDto {
  @IsString()
  subject: string;

  @IsString()
  topic: string;

  @IsInt()
  @Min(1)
  @Max(20)
  count: number;

  @IsEnum(Difficulty)
  @IsOptional()
  difficulty?: Difficulty = Difficulty.MEDIUM;

  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType = QuestionType.MULTIPLE_CHOICE;

  @IsString()
  @IsOptional()
  additionalInstructions?: string;
}
