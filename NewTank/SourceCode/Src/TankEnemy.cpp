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
}

CTankEnemy::~CTankEnemy()
{

}
void CTankEnemy::Born()
{
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
                    SetMaxSpeed(10);
                    SetTankBackLine(5);
                    break;
                }
        }
}
void CTankEnemy::OnMove()
{

}
void CTankEnemy::OnFire()
{
    
}