// TankEnemy.cpp: implementation of the CTankEnemy class.
//
//////////////////////////////////////////////////////////////////////

#include "TankEnemy.h"
#include "LessonX.h"

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CTankEnemy::CTankEnemy(const char* szname):CWeapon(szname)
{
    m_iEnemyBornTime = 0;
    m_bEnemyBorn = false;
    m_fChangeDirTime = 0;
    m_fCHangeColorTime = 0;
    m_fFireTime = 0;
    
}

CTankEnemy::~CTankEnemy()
{

}
void CTankEnemy::Born()
{
    m_iEnemyTarget = CSystem::RandomRange(0,2);
    SetSpriteCollisionActive(1,1);//设置为可以接受和发生碰撞
    SetSpriteWorldLimit(WORLD_LIMIT_STICKY, -37.5, -37.5, 37.5, 37.5);
    float xl = CSystem::GetScreenTop()+GetSpriteWidth()/2;
    float xr = CSystem::GetScreenBottom()-GetSpriteWidth()/2;
    float yt = CSystem::GetScreenTop()+GetSpriteWidth()/2;
    float yb = CSystem::GetScreenBottom()-GetSpriteWidth()/2;
    switch (GetEnemyPlace())
        {
            case 1:
                {
                    SetSpritePosition(xl,yt);
                    break;
                }
            case 2:
                {
                    SetSpritePosition(xr,yt);
                    break;
                }
            case 3:
                {
                    SetSpritePosition(xr,yb);
                    break;
                }
            case 4:
                {
                    SetSpritePosition(xl,yb);
                    break;
                }
        }
    switch (GetEnemySpecies())
        {
            case 1:
                {
                    SetHp(50);
                    SetMaxSpeed(10);
                    SetTankBackLine(5);
                    break;
                }
            case 2:
                {
                    SetHp(50);
                    SetMaxSpeed(10);
                    SetTankBackLine(5);
                    break;
                }
        }
    m_bEnemyBorn = true;
}
void CTankEnemy::OnMove()
{
	SetDir(CSystem::RandomRange(1,4));
	switch (GetDir())
        {
	        case 1:
		        {
		            SetSpeedX(-GetMaxSpeed());
		            SetSpeedY(0);
                    SetSpriteFlipX(false);
                    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_MA_",GetEnemySpecies()),false);
		            break;
                }
	        case 2:
		        {   
		            SetSpeedX(0);
		            SetSpeedY(-GetMaxSpeed());
                    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_MW_",GetEnemySpecies()),false);
		            break;
                }
        	case 3:
	           	{   
	           	    SetSpeedX(GetMaxSpeed());
		            SetSpeedY(0);
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_MA_",GetEnemySpecies()),false);
        		    break;
                }
        	case 4:
           		{
           		    SetSpeedX(0);
           		    SetSpeedY(GetMaxSpeed());    
                    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_MS_",GetEnemySpecies()),false);  
		            break;
                }
        }
    SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
}
void CTankEnemy::OnFire()
{
    float x,y;
	x = GetSpritePositionX();
	y = GetSpritePositionY();
    switch (GetDir())
        {
            case 2:
                {
					AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_FW_",GetEnemySpecies()),true);
					y=y-GetSpriteHeight()/2;
					break;
				}
			case 3:
        	    {
					SetSpriteFlipX(true);
            	    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_FA_",GetEnemySpecies()),true);
					x=x+GetSpriteWidth()/2+1;
					y=y-0.5;	
					break;
				}
			case 4:
    	        {
					AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_FS_",GetEnemySpecies()),true);
					y=y+GetSpriteHeight()/2;
					break;
				}
			case 1:
    	        {
					SetSpriteFlipX(false);
        	        AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_FA_",GetEnemySpecies()),true);
					x=x-GetSpriteWidth()/2-1;
					y=y-0.5;
					break;
				}
	        }
		g_GameMain.AddBullet(GetDir(),x,y,0,GetAttack());
		TankBack();    
}
void CTankEnemy::Loop(float fDeltaTime)
{
    m_fChangeDirTime+=fDeltaTime;
    m_fFireTime+=fDeltaTime;
	if(m_fChangeDirTime>1.0f)
	{	
		OnMove();
		m_fChangeDirTime = 0.f;
	}
    if(GetSpriteColorGreen()!=255)
    {
        m_fCHangeColorTime+=fDeltaTime;
        if (m_fCHangeColorTime>0.5)
        {
            m_fCHangeColorTime = 0.f;
            SetSpriteColorGreen(255);
            SetSpriteColorBlue(255);
        }
    }
    if(m_fFireTime>4.0)
    {
        OnFire();
        m_fFireTime = 0.f;
    }
    
}

void CTankEnemy::OnColMap(int tanktrans)
{
    if (tanktrans==0)
        {
            SetSpeedX(0);
            SetSpeedY(0);
            SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
            //OnMove(CSystem::RandomRange(1,4));
        }
}
void CTankEnemy::OnColTank()
{
    SetSpeedX(0);
    SetSpeedY(0);
    SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
    //OnMove(CSystem::RandomRange(1,4));
}
void CTankEnemy::OnMove(int dir)
{
	switch (dir)
        {
	        case 1:
		        {
		            SetSpeedX(-GetMaxSpeed());
		            SetSpeedY(0);
                    SetSpriteFlipX(false);
                    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_MA_",GetEnemySpecies()),false);
		            break;
                }
	        case 2:
		        {   
		            SetSpeedX(0);
		            SetSpeedY(-GetMaxSpeed());
                    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_MW_",GetEnemySpecies()),false);
		            break;
                }
        	case 3:
	           	{   
	           	    SetSpeedX(GetMaxSpeed());
		            SetSpeedY(0);
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_MA_",GetEnemySpecies()),false);
        		    break;
                }
        	case 4:
           		{
           		    SetSpeedX(0);
           		    SetSpeedY(GetMaxSpeed());    
                    AnimateSpritePlayAnimation(CSystem::MakeSpriteName("TankEnemy_MS_",GetEnemySpecies()),false);  
		            break;
                }
        }
    SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
}

void CTankEnemy::OnColBullet(int owner,float attack)
{
    if (owner==1)
        {
            SetHp(GetHp()-attack);
            SetSpriteColorGreen(120);
            SetSpriteColorBlue(120);
        }
}
void CTankEnemy::TankBack()
{
    float x =  GetSpritePositionX();
    float y =  GetSpritePositionY();
    switch(GetDir())
        {
            case 2:
                y = y + GetTankBackLine();
                break;
            case 3:
                x = x - GetTankBackLine();
                break;
            case 4:
                y = y - GetTankBackLine();
                break;
            case 1:
                x = x + GetTankBackLine();
                break;
        }
    SpriteMoveTo(x,y,50,true);
}
void CTankEnemy::OnColMiss(float attack)
{
    SetSpriteLinearVelocity(0,0);
    SetHp(GetHp()-attack);
    AnimateSpritePlayAnimation("Boom",false);
}